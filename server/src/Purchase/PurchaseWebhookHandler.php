<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

require_once __DIR__ . '/../WebhookResult.php';

use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\PaddleSignature;
use KanaGame\Paddle\PaymentEventRepository;
use KanaGame\Paddle\ProductMatcher;
use KanaGame\Paddle\WebhookResult;
use PDO;

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

    // Phase H1-3. Confirmed against current Paddle Billing docs: these
    // are the four chargeback-family adjustment `action` values, each
    // its own action (not a status transition of one shared action --
    // unlike refund, which uses one action with status
    // pending_approval/approved/rejected). Do NOT branch chargeback
    // handling on `data.status` -- action is the sole signal for what
    // transition to apply; see applyChargebackTransition().
    private const CHARGEBACK_ACTION = 'chargeback';
    private const CHARGEBACK_REVERSE_ACTION = 'chargeback_reverse';
    private const CHARGEBACK_WARNING_ACTION = 'chargeback_warning';
    private const CHARGEBACK_WARNING_REVERSE_ACTION = 'chargeback_warning_reverse';

    private const CHARGEBACK_FAMILY_ACTIONS = [
        self::CHARGEBACK_ACTION,
        self::CHARGEBACK_REVERSE_ACTION,
        self::CHARGEBACK_WARNING_ACTION,
        self::CHARGEBACK_WARNING_REVERSE_ACTION,
    ];

    public function __construct(
        private readonly PDO $pdo,
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

    /**
     * Phase H1-2: everything from the event claim through the
     * entitlement recompute runs inside ONE PDO transaction, owned
     * here (no repository called from this method may open its own
     * transaction — see PurchaseIntentRepository::consume(),
     * TransactionGrantRepository::create()/updateStatus(),
     * PendingAdjustmentRepository, EntitlementRepository::upsert(),
     * none of which do). Signature verification and payload parsing
     * happen BEFORE the transaction starts — they have no DB side
     * effects, so there is nothing to roll back for a malformed or
     * unsigned request, and it keeps the transaction window as short
     * as possible.
     *
     * The event claim (PaymentEventRepository::claim(), backed by the
     * UNIQUE (paddle_event_id) constraint) is the FIRST write inside
     * the transaction, not a record-on-success step at the end. This
     * makes the whole request idempotent under concurrent/racing
     * redelivery: a losing concurrent claim is turned away before any
     * other table is touched, and a crash/exception anywhere later in
     * the SAME transaction rolls the claim back too -- so Paddle's
     * retry of that event_id is processed fresh (including re-consuming
     * the still-unconsumed purchase_intent) rather than being
     * permanently locked out by a claim that survived a rollback of
     * everything else.
     */
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

        try {
            $occurredAt = new \DateTimeImmutable($occurredAtRaw);
        } catch (\Exception) {
            return WebhookResult::malformedPayload();
        }

        $transactionId = $this->extractTransactionId($eventType, $data);

        $this->pdo->beginTransaction();
        try {
            if (!$this->events->claim($eventId, $eventType, $transactionId, $occurredAt)) {
                $this->pdo->rollBack();
                return WebhookResult::duplicateEvent();
            }

            $handled = match ($eventType) {
                self::EVENT_TRANSACTION_COMPLETED => $this->handleTransactionCompleted($data, $occurredAt),
                self::EVENT_ADJUSTMENT_CREATED, self::EVENT_ADJUSTMENT_UPDATED => $this->handleAdjustment($eventId, $data, $occurredAt),
                default => false,
            };

            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            // Re-thrown, never converted to a WebhookResult here -- the
            // caller (server/paddle-webhook.php) turns an uncaught
            // exception into a 500 so Paddle retries. Swallowing it here
            // would mean acknowledging a delivery whose transaction was
            // just rolled back, which is exactly the silent-failure
            // mode this transaction wrap exists to prevent.
            throw $e;
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
        if ($action !== self::REFUND_ACTION && !in_array($action, self::CHARGEBACK_FAMILY_ACTIONS, true)) {
            // Any other adjustment action (e.g. 'credit') is
            // intentionally not acted upon and not queued -- queueing
            // is specifically for reconciling entitlement-affecting
            // transitions against a not-yet-arrived transaction.
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

        $items = $data['items'] ?? null;

        $grant = $this->grants->findByTransactionId($transactionId);
        if ($grant === null) {
            // Paddle does not guarantee webhook delivery order -- the
            // transaction.completed this adjustment refers to may not
            // have arrived yet. Queue it for reconciliation rather than
            // dropping it. This applies identically to refund and
            // chargeback-family actions; $action is stored so
            // reconcilePendingAdjustments() can dispatch correctly once
            // the transaction arrives.
            $this->pendingAdjustments->queue($transactionId, $eventId, $action, $adjustmentStatus, $adjustmentType, $items, $occurredAt);
            return true;
        }

        return $this->applyAdjustmentTransition($grant['user_id'], $grant['product_key'], $transactionId, $action, $adjustmentStatus, $adjustmentType, $items, $occurredAt);
    }

    /**
     * Dispatches to the refund or chargeback-family transition logic
     * based on $action alone -- the single entry point both the direct
     * path (handleAdjustment()) and reconciliation
     * (reconcilePendingAdjustments()) go through, so the two can never
     * diverge in which rule set applies to a given action.
     *
     * @param mixed $items The adjustment's `data.items`, if present.
     */
    private function applyAdjustmentTransition(
        string $userId,
        string $productKey,
        string $transactionId,
        string $action,
        string $adjustmentStatus,
        string $adjustmentType,
        mixed $items,
        \DateTimeImmutable $occurredAt,
    ): bool {
        if (in_array($action, self::CHARGEBACK_FAMILY_ACTIONS, true)) {
            return $this->applyChargebackTransition($userId, $productKey, $transactionId, $action, $occurredAt);
        }

        return $this->applyRefundTransition($userId, $productKey, $transactionId, $adjustmentStatus, $adjustmentType, $items, $occurredAt);
    }

    /**
     * Applies one refund status transition to an existing grant, per
     * the design spec's lifecycle rules:
     *   pending_approval -> refund_pending (still entitlement-bearing)
     *   approved + full refund of the grant -> refunded (revokes)
     *   approved + not a full refund of the grant -> no status change
     *     (recorded/idempotent only -- partial-refund entitlement
     *     policy remains deferred)
     *   rejected -> active (restored)
     * "Full refund of the grant" is decided by RefundCompleteness --
     * NOT simply adjustment-level type === 'full' -- see that class for
     * why (Paddle reports item-scoped full refunds as adjustment-level
     * `partial`). A stale (older occurred_at) transition is discarded by
     * TransactionGrantRepository::updateStatus() itself.
     *
     * @param mixed $items The adjustment's `data.items`, if present.
     */
    private function applyRefundTransition(
        string $userId,
        string $productKey,
        string $transactionId,
        string $adjustmentStatus,
        string $adjustmentType,
        mixed $items,
        \DateTimeImmutable $occurredAt,
    ): bool {
        $isFullRefund = RefundCompleteness::isFullRefund($adjustmentType, $items);

        $newStatus = match (true) {
            $adjustmentStatus === 'pending_approval' => 'refund_pending',
            $adjustmentStatus === 'approved' && $isFullRefund => 'refunded',
            $adjustmentStatus === 'approved' && !$isFullRefund => null,
            $adjustmentStatus === 'rejected' => 'active',
            default => null,
        };

        if ($newStatus === null) {
            // Either an approved refund that does not fully cover the
            // grant (recorded via payment_events idempotency, but no
            // grant status change -- partial-refund entitlement policy
            // remains deferred) or an unrecognized/unconfirmed status
            // value. Either way: safely acknowledged, no state change.
            return $adjustmentStatus === 'approved' && !$isFullRefund;
        }

        $applied = $this->grants->updateStatus($transactionId, $newStatus, $occurredAt);
        if ($applied) {
            $this->recomputeEntitlement($userId, $productKey, $transactionId);
        }

        return $applied;
    }

    /**
     * Applies one chargeback-family transition, per the design spec's
     * first-candidate policy:
     *   chargeback         -> 'chargeback'          (revokes)
     *   chargeback_warning -> 'chargeback_pending'   (revokes)
     *   chargeback_reverse         -> 'active', ONLY from 'chargeback'
     *   chargeback_warning_reverse -> 'active', ONLY from 'chargeback_pending'
     *
     * $action alone decides the target status -- data.status is never
     * read here (unlike refund's pending_approval/approved/rejected
     * lifecycle), per the design spec's explicit instruction not to
     * depend on a chargeback event's initial status.
     *
     * EVERY chargeback-family transition -- forward AND reversal --
     * passes an $allowedFromStatuses list to TransactionGrantRepository::
     * updateStatus(), independent of and in addition to the existing
     * status_changed_at staleness check. Without a guard on the FORWARD
     * transitions too, 'refunded' would not be a true terminal state:
     * an indirect path (refunded -> [later] chargeback -> [later still]
     * chargeback_reverse -> active) would still reactivate an
     * already-finalized refund, because each hop individually passes
     * its own occurred_at-newer-than-last check even though the
     * reversal's own direct guard (chargeback_reverse only from
     * 'chargeback') is satisfied by the intermediate chargeback hop.
     * 'refunded' is therefore excluded from every chargeback-family
     * FROM-list below, forward and reversal alike -- once a grant is
     * 'refunded', NOTHING in this method can move it anywhere else.
     *
     *   chargeback:         from 'active', 'refund_pending',
     *                        'chargeback_pending' (a warning escalating
     *                        to a full chargeback), or 'chargeback'
     *                        itself (idempotent redelivery/reprocessing)
     *   chargeback_warning: from 'active' or 'refund_pending' only --
     *                        NOT from 'chargeback_pending' (already
     *                        warned; a redelivery is a stale/duplicate
     *                        occurred_at now, not a fresh transition,
     *                        so it is left to the staleness guard) and
     *                        NOT from 'chargeback' (a warning must
     *                        never downgrade an already-final
     *                        chargeback)
     *   chargeback_reverse:         ONLY from 'chargeback'
     *   chargeback_warning_reverse: ONLY from 'chargeback_pending'
     *
     * refund_pending -> chargeback remains explicitly allowed (existing
     * policy, unchanged) -- a chargeback can legitimately arrive while
     * a refund request is still pending approval.
     *
     * Repurchase safety is structural, not logic here: transaction_grants
     * has one row per Paddle transaction, never per (user, product), so
     * a chargeback/reversal for an old transaction can only ever touch
     * ITS OWN row -- see TransactionGrantRepository's own class
     * doc comment.
     */
    private function applyChargebackTransition(
        string $userId,
        string $productKey,
        string $transactionId,
        string $action,
        \DateTimeImmutable $occurredAt,
    ): bool {
        [$newStatus, $allowedFromStatuses] = match ($action) {
            self::CHARGEBACK_ACTION => ['chargeback', ['active', 'refund_pending', 'chargeback_pending', 'chargeback']],
            self::CHARGEBACK_WARNING_ACTION => ['chargeback_pending', ['active', 'refund_pending']],
            self::CHARGEBACK_REVERSE_ACTION => ['active', ['chargeback']],
            self::CHARGEBACK_WARNING_REVERSE_ACTION => ['active', ['chargeback_pending']],
            default => [null, null],
        };

        if ($newStatus === null) {
            return false;
        }

        $applied = $this->grants->updateStatus($transactionId, $newStatus, $occurredAt, $allowedFromStatuses);
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
     * the same stale-event-discarding, source-status-guarded
     * updateStatus() via applyAdjustmentTransition().
     */
    private function reconcilePendingAdjustments(string $transactionId): void
    {
        $grant = $this->grants->findByTransactionId($transactionId);
        if ($grant === null) {
            return;
        }

        foreach ($this->pendingAdjustments->findUnreconciledForTransaction($transactionId) as $pending) {
            $occurredAt = new \DateTimeImmutable($pending['occurred_at']);
            $this->applyAdjustmentTransition(
                $grant['user_id'],
                $grant['product_key'],
                $transactionId,
                $pending['action'],
                $pending['adjustment_status'],
                $pending['adjustment_type'],
                $pending['items'],
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
}
