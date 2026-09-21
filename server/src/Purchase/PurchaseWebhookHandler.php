<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

require_once __DIR__ . '/../WebhookResult.php';
require_once __DIR__ . '/GrantAdjustmentReducer.php';
require_once __DIR__ . '/TransactionEventLockRepository.php';

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
        private readonly TransactionEventLockRepository $transactionLocks,
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

            // Distinct Paddle event ids for the SAME transaction must not
            // race one another. The event-id claim above handles duplicate
            // delivery of one logical event; this row lock handles different
            // logical events such as transaction.completed vs refund.
            if ($transactionId !== null && $transactionId !== ''
                && in_array($eventType, [
                    self::EVENT_TRANSACTION_COMPLETED,
                    self::EVENT_ADJUSTMENT_CREATED,
                    self::EVENT_ADJUSTMENT_UPDATED,
                ], true)
            ) {
                $this->transactionLocks->lock($transactionId);
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

        $this->lockUserForEntitlementUpdate($userId);

        $created = $this->grants->create($transactionId, $userId, $intentProductKey, $intentId, $occurredAt);
        if (!$created) {
            // A duplicate paddle_transaction_id (redelivery) or a
            // purchase_intent_id already claimed by another transaction
            // (should be impossible given the atomic consume above, but
            // the UNIQUE constraint is a second, schema-level
            // guarantee) -- either way, safely ignored, not an error.
            return false;
        }

        // Rebuild the grant from its complete normalized adjustment
        // history while this request still holds both the transaction lock
        // and the per-user entitlement lock. With no adjustments this keeps
        // the fresh grant active and simply materializes entitlement.
        $this->replayAdjustmentHistory($transactionId);

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

        // Keep EVERY entitlement-affecting adjustment as normalized history,
        // regardless of whether transaction.completed has arrived yet. The
        // unique paddle_event_id makes this idempotent, and replaying the
        // complete chronologically sorted history means final state never
        // depends on webhook arrival order.
        $this->pendingAdjustments->queue(
            $transactionId,
            $eventId,
            $action,
            $adjustmentStatus,
            $adjustmentType,
            $items,
            $occurredAt,
        );

        $grant = $this->grants->findByTransactionId($transactionId);
        if ($grant === null) {
            return true;
        }

        $this->replayAdjustmentHistory($transactionId);
        return true;
    }

    /**
     * Rebuild one grant from the complete normalized adjustment history.
     *
     * Caller already holds the per-Paddle-transaction lock. We additionally
     * take the existing per-user lock before mutating the grant/materialized
     * entitlement, preserving the write-skew protection across repurchases
     * and adjustments for different transactions belonging to the same user.
     */
    private function replayAdjustmentHistory(string $transactionId): void
    {
        $grant = $this->grants->findByTransactionId($transactionId);
        if ($grant === null) {
            return;
        }

        $this->lockUserForEntitlementUpdate($grant['user_id']);

        $history = $this->pendingAdjustments->findAllForTransaction($transactionId);
        $reduced = GrantAdjustmentReducer::reduce(
            new \DateTimeImmutable($grant['granted_at']),
            $history,
        );

        $this->grants->replaceStatusFromReplay(
            $transactionId,
            $reduced['status'],
            $reduced['changed_at'],
        );

        $this->recomputeEntitlement(
            $grant['user_id'],
            $grant['product_key'],
            $transactionId,
        );

        // Rows are deliberately retained after reconciliation so a later,
        // out-of-order event can replay the full history. reconciled_at is
        // operational bookkeeping, not a deletion/skip signal.
        $this->pendingAdjustments->markAllReconciledForTransaction($transactionId);
    }

    /**
     * Common serialization point for Defect C3 (write-skew on
     * entitlements.active under concurrent grant mutations for the same
     * user/product -- e.g. two concurrent full refunds of two active
     * grants each independently seeing "the other grant is still
     * active" and leaving entitlements.active = true after both
     * refunds succeed).
     *
     * MUST be called after the current transaction's event claim and
     * identity/grant lookup, and BEFORE any grant-state mutation
     * (transaction_grants create()/updateStatus()) for this user, on
     * EVERY code path that can mutate a grant and then recompute
     * entitlement: handleTransactionCompleted(), applyRefundTransition(),
     * applyChargebackTransition() (which also covers
     * reconcilePendingAdjustments(), since it goes through
     * applyAdjustmentTransition() -> one of those two). This fixed
     * ordering -- event claim -> lookup -> this lock -> grant mutation
     * -> entitlement-bearing current read -> entitlement upsert ->
     * commit -- is identical on every path, which is what avoids
     * deadlock: no path ever acquires this lock, or any other lock, in
     * a different order relative to another path's locks.
     *
     * Locks the `users` row for $userId with a MariaDB locking read
     * (FOR UPDATE), NOT a per-grant lock: locking transaction_grants
     * rows directly (e.g. adding FOR UPDATE only to
     * hasEntitlementBearingGrant()) is unsafe here, because two
     * concurrent transactions for the same user/product can each first
     * lock a *different* grant row (their own triggering grant) before
     * either reaches a range-locking read across both -- a classic
     * deadlock shape. Locking one single, always-the-same row (the
     * user's own `users` row) first, before touching transaction_grants
     * at all, gives a single total order and cannot deadlock against
     * another call of this same method. This serializes entitlement-
     * changing transactions per user, not globally; Tamamizu currently
     * sells one product (full_tamamizu), so per-user contention is the
     * only contention this introduces, and it is expected to be low.
     *
     * On SQLite (the unit-test dialect) this is a no-op: SQLite has no
     * locking-read syntax, the existing test suite's fixtures run
     * every statement sequentially on one connection (no real
     * concurrency to serialize against), and several fixtures
     * (e.g. PurchaseWebhookHandlerTest's SQLite schema) do not create a
     * `users` table at all, by design -- only the MariaDB concurrency
     * harness exercises this method's actual locking behavior.
     */
    private function lockUserForEntitlementUpdate(string $userId): void
    {
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        if ($driver === 'sqlite') {
            return;
        }

        $statement = $this->pdo->prepare('SELECT id FROM users WHERE id = :id FOR UPDATE');
        $statement->execute(['id' => $userId]);
        $statement->fetch();
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
