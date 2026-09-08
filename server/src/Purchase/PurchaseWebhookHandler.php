<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

require_once __DIR__ . '/../WebhookResult.php';

use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\PaddleSignature;
use KanaGame\Paddle\PaymentEventRepository;
use KanaGame\Paddle\ProductMatcher;
use KanaGame\Paddle\WebhookResult;

/**
 * Phase 3A purchase-attribution webhook logic — the real-user path,
 * entirely separate from server/src/WebhookHandler.php (Phase 2's
 * fixed-Sandbox-user PoC, kept unchanged as a development-only
 * compatibility path). This class has NO dependency on SandboxUser and
 * NEVER falls back from purchase_ref to a browser-supplied
 * internal_user_id — absence or invalidity of purchase_ref always
 * results in "safely acknowledged, no entitlement grant," never a
 * fallback to any other identity source.
 *
 * Reuses Phase 2's shared, already-verified infrastructure: signature
 * verification (PaddleSignature), event idempotency
 * (PaymentEventRepository), price/product matching (ProductMatcher),
 * and the entitlements materialized-cache table (EntitlementRepository)
 * — this class owns only the NEW Phase 3 purchase-attribution and
 * grant/refund state machine (purchase_intents, transaction_grants,
 * pending_adjustments).
 *
 * Event names/shapes confirmed against current (2026-09) Paddle Billing
 * docs — see docs/superpowers/specs/2026-09-08-paddle-auth-
 * entitlement-phase3-design.md, section 4, and
 * docs/paddle-webhook-poc.md's "Official Paddle docs checked" (the
 * envelope/signature shape is identical to Phase 2's).
 */
final class PurchaseWebhookHandler
{
    private const EVENT_TRANSACTION_COMPLETED = 'transaction.completed';
    private const EVENT_ADJUSTMENT_CREATED = 'adjustment.created';
    private const EVENT_ADJUSTMENT_UPDATED = 'adjustment.updated';
    private const REFUND_ACTION = 'refund';

    public function __construct(
        private readonly PaddleSignature $signature,
        private readonly PaymentEventRepository $events,
        private readonly PurchaseIntentRepository $intents,
        private readonly TransactionGrantRepository $grants,
        private readonly PendingAdjustmentRepository $pendingAdjustments,
        private readonly EntitlementRepository $entitlements,
        private readonly string $expectedPriceId,
        private readonly string $expectedProductId,
    ) {
    }

    public function handle(string $rawBody, ?string $signatureHeader): WebhookResult
    {
        if ($signatureHeader === null || $signatureHeader === '' || !$this->signature->verify($rawBody, $signatureHeader)) {
            return WebhookResult::invalidSignature();
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            return WebhookResult::malformedPayload();
        }

        $eventId = $payload['event_id'] ?? null;
        $eventType = $payload['event_type'] ?? null;
        $occurredAtRaw = $payload['occurred_at'] ?? null;
        $data = $payload['data'] ?? null;

        if (!is_string($eventId) || $eventId === '' || !is_string($eventType) || $eventType === '' || !is_string($occurredAtRaw) || !is_array($data)) {
            return WebhookResult::malformedPayload();
        }

        if ($this->events->alreadyProcessed($eventId)) {
            return WebhookResult::duplicateEvent();
        }

        try {
            $occurredAt = new \DateTimeImmutable($occurredAtRaw);
        } catch (\Exception) {
            return WebhookResult::malformedPayload();
        }

        $transactionId = $this->extractTransactionId($eventType, $data);

        $handled = match ($eventType) {
            self::EVENT_TRANSACTION_COMPLETED => $this->handleTransactionCompleted($data, $occurredAt),
            self::EVENT_ADJUSTMENT_CREATED, self::EVENT_ADJUSTMENT_UPDATED => $this->handleAdjustment($eventId, $data, $occurredAt),
            default => false,
        };

        try {
            $this->events->record($eventId, $eventType, $transactionId, $occurredAt);
        } catch (\PDOException $e) {
            if ($this->isUniqueConstraintViolation($e)) {
                return WebhookResult::duplicateEvent();
            }
            return WebhookResult::serverError();
        }

        return $handled ? WebhookResult::processed($eventType) : WebhookResult::ignoredEvent($eventType);
    }

    /**
     * @param array<mixed> $data
     */
    private function extractTransactionId(string $eventType, array $data): ?string
    {
        if ($eventType === self::EVENT_TRANSACTION_COMPLETED) {
            $id = $data['id'] ?? null;
            return is_string($id) ? $id : null;
        }
        $id = $data['transaction_id'] ?? null;
        return is_string($id) ? $id : null;
    }

    /**
     * @param array<mixed> $data The transaction.completed event's `data` object.
     */
    private function handleTransactionCompleted(array $data, \DateTimeImmutable $occurredAt): bool
    {
        $status = $data['status'] ?? null;
        if ($status !== 'completed') {
            return false;
        }

        $transactionId = $data['id'] ?? null;
        if (!is_string($transactionId) || $transactionId === '') {
            return false;
        }

        if (!ProductMatcher::matches($data, $this->expectedPriceId, $this->expectedProductId)) {
            return false;
        }

        // The Phase 3A path reads ONLY custom_data.purchase_ref.
        // custom_data.internal_user_id (the Phase 2 PoC field) is
        // NEVER read here, by construction -- there is no code path in
        // this class that looks at that key at all.
        $customData = $data['custom_data'] ?? null;
        $purchaseRef = is_array($customData) ? ($customData['purchase_ref'] ?? null) : null;
        if (!is_string($purchaseRef) || $purchaseRef === '') {
            return false;
        }

        $purchaseRefHash = hash('sha256', $purchaseRef);

        // Atomic single-use consume -- see PurchaseIntentRepository::
        // consume(). Affected rows = 0 means: unknown hash, already
        // consumed, or expired. Any of those is safely ignored, never
        // an entitlement grant.
        if (!$this->intents->consume($purchaseRefHash, $transactionId)) {
            return false;
        }

        $userId = $this->intents->findUserIdForHash($purchaseRefHash);
        $intentProductKey = $this->intents->findProductKeyForHash($purchaseRefHash);
        $intentId = $this->intents->findIdForHash($purchaseRefHash);

        if ($userId === null || $intentProductKey === null || $intentId === null) {
            // Defensive -- consume() having returned true means the row
            // existed a moment ago, so this should be unreachable.
            return false;
        }

        $created = $this->grants->create($transactionId, $userId, $intentProductKey, $intentId, $occurredAt);
        if (!$created) {
            // A duplicate paddle_transaction_id (redelivery) or a
            // purchase_intent_id already claimed by another transaction
            // (should be impossible given the atomic consume above, but
            // the UNIQUE constraint is a second, schema-level
            // guarantee) -- either way, safely ignored, not an error.
            return false;
        }

        $this->recomputeEntitlement($userId, $intentProductKey, $transactionId);
        $this->reconcilePendingAdjustments($transactionId);

        return true;
    }

    /**
     * @param array<mixed> $data The adjustment.created/updated event's `data` object.
     */
    private function handleAdjustment(string $eventId, array $data, \DateTimeImmutable $occurredAt): bool
    {
        $action = $data['action'] ?? null;
        if ($action !== self::REFUND_ACTION) {
            // Chargeback-family actions and non-refund adjustment types
            // are intentionally not acted upon in PR B -- recognized as
            // existing, never invented behavior for. Not queued either
            // (queueing is specifically for reconciling entitlement-
            // affecting refund transitions against not-yet-arrived
            // transactions).
            return false;
        }

        $transactionId = $data['transaction_id'] ?? null;
        $adjustmentStatus = $data['status'] ?? null;
        $adjustmentType = $data['type'] ?? null;
        if (!is_string($transactionId) || $transactionId === ''
            || !is_string($adjustmentStatus) || $adjustmentStatus === ''
            || !is_string($adjustmentType) || $adjustmentType === ''
        ) {
            return false;
        }

        $grant = $this->grants->findByTransactionId($transactionId);
        if ($grant === null) {
            // Paddle does not guarantee webhook delivery order -- the
            // transaction.completed this adjustment refers to may not
            // have arrived yet. Queue it for reconciliation rather than
            // dropping it.
            $this->pendingAdjustments->queue($transactionId, $eventId, $action, $adjustmentStatus, $adjustmentType, $occurredAt);
            return true;
        }

        return $this->applyRefundTransition($grant['user_id'], $grant['product_key'], $transactionId, $adjustmentStatus, $adjustmentType, $occurredAt);
    }

    /**
     * Applies one refund status transition to an existing grant, per
     * the design spec's lifecycle rules:
     *   pending_approval -> refund_pending (still entitlement-bearing)
     *   approved + full  -> refunded (revokes)
     *   approved + partial -> no status change (recorded/idempotent
     *     only -- partial-refund entitlement policy remains deferred)
     *   rejected -> active (restored)
     * A stale (older occurred_at) transition is discarded by
     * TransactionGrantRepository::updateStatus() itself.
     */
    private function applyRefundTransition(
        string $userId,
        string $productKey,
        string $transactionId,
        string $adjustmentStatus,
        string $adjustmentType,
        \DateTimeImmutable $occurredAt,
    ): bool {
        $newStatus = match (true) {
            $adjustmentStatus === 'pending_approval' => 'refund_pending',
            $adjustmentStatus === 'approved' && $adjustmentType === 'full' => 'refunded',
            $adjustmentStatus === 'approved' && $adjustmentType === 'partial' => null,
            $adjustmentStatus === 'rejected' => 'active',
            default => null,
        };

        if ($newStatus === null) {
            // Either a partial-approved refund (recorded via
            // payment_events idempotency, but no grant status change --
            // partial-refund entitlement policy remains deferred) or an
            // unrecognized/unconfirmed status value. Either way: safely
            // acknowledged, no state change.
            return $adjustmentStatus === 'approved' && $adjustmentType === 'partial';
        }

        $applied = $this->grants->updateStatus($transactionId, $newStatus, $occurredAt);
        if ($applied) {
            $this->recomputeEntitlement($userId, $productKey, $transactionId);
        }

        return $applied;
    }

    /**
     * Reconciles any adjustments queued (because they arrived before
     * this transaction's transaction.completed) for the just-created
     * grant. Applies each unreconciled adjustment in occurred_at order
     * (oldest first) -- the LAST one applied (chronologically) is what
     * the grant's final status reflects, since each call goes through
     * the same stale-event-discarding updateStatus().
     */
    private function reconcilePendingAdjustments(string $transactionId): void
    {
        $grant = $this->grants->findByTransactionId($transactionId);
        if ($grant === null) {
            return;
        }

        foreach ($this->pendingAdjustments->findUnreconciledForTransaction($transactionId) as $pending) {
            $occurredAt = new \DateTimeImmutable($pending['occurred_at']);
            $this->applyRefundTransition(
                $grant['user_id'],
                $grant['product_key'],
                $transactionId,
                $pending['adjustment_status'],
                $pending['adjustment_type'],
                $occurredAt,
            );
            $this->pendingAdjustments->markReconciled($pending['paddle_event_id']);
        }
    }

    /**
     * Recomputes the entitlements materialized cache from the current
     * set of transaction_grants rows for this user/product — never
     * trusts "the last event that happened to fire." Reuses Phase 2's
     * EntitlementRepository (same entitlements table/shape) as the
     * cache-write mechanism. $triggeringTransactionId is stored only as
     * an audit trail of which transaction most recently caused a
     * recompute — it does not affect the active/inactive decision
     * itself, which always comes from hasEntitlementBearingGrant()'s
     * full-set check.
     */
    private function recomputeEntitlement(string $userId, string $productKey, string $triggeringTransactionId): void
    {
        $isEntitled = $this->grants->hasEntitlementBearingGrant($userId, $productKey);

        if ($isEntitled) {
            $this->entitlements->activate($userId, $productKey, $triggeringTransactionId);
        } else {
            $this->entitlements->revoke($userId, $productKey, $triggeringTransactionId);
        }
    }

    private function isUniqueConstraintViolation(\PDOException $e): bool
    {
        return $e->getCode() === '23000' || str_contains($e->getMessage(), 'UNIQUE constraint failed');
    }
}
