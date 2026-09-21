<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

require_once __DIR__ . '/../WebhookResult.php';
require_once __DIR__ . '/GrantAdjustmentReducer.php';
require_once __DIR__ . '/TransactionEventLockRepository.php';
require_once __DIR__ . '/ReconciliationBlockRepository.php';

use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\PaddleEventTime;
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
    private bool $quarantinedCurrentEvent = false;

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
    // transition to feed into the deterministic adjustment reducer.
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
        private readonly ReconciliationBlockRepository $reconciliationBlocks,
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
     * TransactionGrantRepository::create()/replaceStatusFromReplay(),
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
     *
     * The deliberate exception is a small fixed set of deterministic
     * reconciliation-invariant failures. Retrying those cannot change the
     * result, so handleAdjustment() converts only those cases into a durable
     * quarantine record and commits the event/history with a fixed 200 outcome.
     * Unknown exceptions still reach this outer rollback/rethrow path.
     */
    public function handle(string $rawBody, ?string $signatureHeader): WebhookResult
    {
        $this->quarantinedCurrentEvent = false;

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

        if ($this->quarantinedCurrentEvent) {
            return WebhookResult::quarantined($eventType);
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

        // A grant created by this code has complete normalized adjustment
        // history from its birth onward, so its immutable replay baseline is
        // the original active transaction.completed state. An empty event-id
        // floor deliberately allows same-timestamp adjustment ids to replay.
        $this->transactionLocks->initializeReplayBaseline(
            $transactionId,
            'active',
            $occurredAt,
            '',
            false,
        );

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

        // Legacy compatibility: before migration 0009, adjustments delivered
        // after a grant existed changed transaction_grants directly and did
        // NOT retain their normalized payload in pending_adjustments. On the
        // first new-code adjustment for such a grant, snapshot its already-
        // materialized state and status_changed_at. That fixed baseline
        // prevents partial legacy history from being replayed from a
        // fictional "active" origin without guessing missing payload details.
        try {
            $this->initializeReplayBaselineForExistingGrant($grant);
            $this->replayAdjustmentHistory($transactionId);
        } catch (\LogicException $e) {
            // Only known, fixed reconciliation invariant failures are
            // deterministic quarantine cases. Any other LogicException is a
            // code bug and must keep the normal 500/retry behavior.
            $reasonCode = $this->reconciliationReasonCode($e);
            if ($reasonCode === null) {
                throw $e;
            }

            $this->quarantineAdjustment(
                $eventId,
                $grant,
                [
                    'action' => $action,
                    'adjustment_status' => $adjustmentStatus,
                    'adjustment_type' => $adjustmentType,
                    'items' => $items,
                    'occurred_at' => PaddleEventTime::format($occurredAt),
                ],
                $reasonCode,
            );
            $this->quarantinedCurrentEvent = true;
        }

        return true;
    }

    /**
     * Rebuild one grant from its immutable baseline plus all retained
     * normalized adjustment history after that baseline.
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

        $baseline = $this->transactionLocks->replayBaseline($transactionId);
        if ($baseline === null) {
            // Never guess an origin. A missing baseline means the matching
            // migration/backend invariants are broken; throw so the outer
            // transaction rolls back and Paddle retries instead of silently
            // materializing a potentially unsafe entitlement state.
            throw new \LogicException('missing Paddle reconciliation baseline');
        }

        $this->assertMaterializedGrantMatchesReconciledHistory($grant, $baseline);

        $history = $this->pendingAdjustments->findAllForTransaction($transactionId);
        $reduced = GrantAdjustmentReducer::reduce(
            $baseline['status'],
            new \DateTimeImmutable($baseline['occurred_at']),
            $baseline['paddle_event_id'],
            $history,
            $baseline['legacy_coarse'],
        );

        // Never silently stamp a pre-baseline row reconciled. A row the reducer
        // skipped may represent a pre-0009 event whose effect cannot be safely
        // reconstructed. If it is still unreconciled, surface a durable block.
        $unreconciledIds = array_column(
            $this->pendingAdjustments->findUnreconciledForTransaction($transactionId),
            'paddle_event_id',
        );
        if (array_intersect($reduced['skipped_event_ids'], $unreconciledIds) !== []) {
            throw new \LogicException('prebaseline unreconciled Paddle adjustment');
        }

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
        $this->pendingAdjustments->markReconciledEvents($reduced['replayed_event_ids']);
    }


    public function reconcileLegacyUnreconciledAdjustments(): int
    {
        if ($this->pdo->inTransaction()) {
            throw new \LogicException('cutover reconciliation requires no active caller transaction');
        }

        $reconciled = 0;
        foreach ($this->pendingAdjustments->findUnreconciledTransactionIdsWithGrant() as $transactionId) {
            $this->pdo->beginTransaction();
            try {
                $this->transactionLocks->lock($transactionId);
                $grant = $this->grants->findByTransactionId($transactionId);
                if ($grant === null) {
                    $this->pdo->commit();
                    continue;
                }

                $this->initializeReplayBaselineForExistingGrant($grant);
                $this->replayAdjustmentHistory($transactionId);
                $this->pdo->commit();
                $reconciled++;
            } catch (\LogicException $e) {
                if ($this->pdo->inTransaction()) {
                    $this->pdo->rollBack();
                }
                $reasonCode = $this->reconciliationReasonCode($e);
                if ($reasonCode === null) {
                    throw $e;
                }
                // One poisoned legacy transaction must not prevent repair of
                // every later transaction. Persist a block for all of its
                // unreconciled rows, conservatively recompute entitlement,
                // then continue; the cutover zero/block-count gate remains
                // non-zero until an operator resolves it.
                $this->quarantineCutoverTransaction($transactionId, $reasonCode);
            } catch (\Throwable $e) {
                if ($this->pdo->inTransaction()) {
                    $this->pdo->rollBack();
                }
                throw $e;
            }
        }

        return $reconciled;
    }

    /**
     * @param array{
     *   paddle_transaction_id: string,
     *   user_id: string,
     *   product_key: string,
     *   purchase_intent_id: int,
     *   status: string,
     *   granted_at: string,
     *   status_changed_at: string
     * } $grant
     * @param array{status: string, occurred_at: string, paddle_event_id: string, legacy_coarse: bool} $baseline
     */
    private function assertMaterializedGrantMatchesReconciledHistory(array $grant, array $baseline): void
    {
        $previousHistory = $this->pendingAdjustments->findReconciledForTransaction(
            $grant['paddle_transaction_id'],
        );
        $expected = GrantAdjustmentReducer::reduce(
            $baseline['status'],
            new \DateTimeImmutable($baseline['occurred_at']),
            $baseline['paddle_event_id'],
            $previousHistory,
            $baseline['legacy_coarse'],
        );

        $actualChangedAt = PaddleEventTime::format(
            new \DateTimeImmutable($grant['status_changed_at']),
        );
        $expectedChangedAt = PaddleEventTime::format($expected['changed_at']);

        if ($grant['status'] !== $expected['status'] || $actualChangedAt !== $expectedChangedAt) {
            throw new \LogicException('materialized Paddle grant diverged from reconciliation history');
        }
    }

    /**
     * @param array{
     *   paddle_transaction_id: string,
     *   user_id: string,
     *   product_key: string,
     *   purchase_intent_id: int,
     *   status: string,
     *   granted_at: string,
     *   status_changed_at: string
     * } $grant
     * @param array{action:string,adjustment_status:string,adjustment_type:string,items:mixed,occurred_at:string} $adjustment
     */
    private function quarantineAdjustment(
        string $eventId,
        array $grant,
        array $adjustment,
        string $reasonCode,
    ): void {
        $forceExclude = $this->blockedAdjustmentRequiresTransactionExclusion();

        $this->reconciliationBlocks->record(
            $eventId,
            $grant['paddle_transaction_id'],
            $reasonCode,
            $adjustment['action'],
            $adjustment['adjustment_status'],
            $adjustment['adjustment_type'],
            new \DateTimeImmutable($adjustment['occurred_at']),
            $forceExclude,
        );

        $this->lockUserForEntitlementUpdate($grant['user_id']);
        $this->recomputeEntitlement(
            $grant['user_id'],
            $grant['product_key'],
            $grant['paddle_transaction_id'],
        );
    }

    private function quarantineCutoverTransaction(string $transactionId, string $reasonCode): void
    {
        $this->pdo->beginTransaction();
        try {
            $this->transactionLocks->lock($transactionId);
            $grant = $this->grants->findByTransactionId($transactionId);
            if ($grant === null) {
                $this->pdo->commit();
                return;
            }

            $rows = $this->pendingAdjustments->findUnreconciledForTransaction($transactionId);
            $this->lockUserForEntitlementUpdate($grant['user_id']);

            foreach ($rows as $row) {
                $forceExclude = $this->blockedAdjustmentRequiresTransactionExclusion();
                $this->reconciliationBlocks->record(
                    $row['paddle_event_id'],
                    $transactionId,
                    $reasonCode,
                    $row['action'],
                    $row['adjustment_status'],
                    $row['adjustment_type'],
                    new \DateTimeImmutable($row['occurred_at']),
                    $forceExclude,
                );
            }

            $this->recomputeEntitlement(
                $grant['user_id'],
                $grant['product_key'],
                $transactionId,
            );
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Once deterministic replay cannot prove one transaction's history, that
     * transaction is not safe to count as entitlement-bearing in either
     * direction. Exclude only this transaction until operator resolution;
     * another healthy repurchase for the same user/product still counts.
     */
    private function blockedAdjustmentRequiresTransactionExclusion(): bool
    {
        return true;
    }

    private function reconciliationReasonCode(\LogicException $e): ?string
    {
        return match ($e->getMessage()) {
            'ambiguous legacy coarse replay would restore entitlement' => 'legacy_coarse_restore',
            'materialized Paddle grant diverged from reconciliation history' => 'materialized_history_divergence',
            'missing Paddle reconciliation baseline' => 'missing_baseline',
            'prebaseline unreconciled Paddle adjustment' => 'prebaseline_unreconciled',
            default => null,
        };
    }

    /**
     * Establishes the one-time replay baseline for a grant created by the
     * pre-0009 backend.
     *
     * The already-materialized status + status_changed_at are the only
     * trustworthy legacy snapshot: old direct adjustment payloads were not
     * retained, and payment_events records event type/time but not adjustment
     * action. Guessing from that ledger could mistake an unrelated legacy
     * credit for an entitlement transition and suppress a legitimate delayed
     * refund. We therefore do not infer missing legacy semantics.
     *
     * @param array{
     *   paddle_transaction_id: string,
     *   user_id: string,
     *   product_key: string,
     *   purchase_intent_id: int,
     *   status: string,
     *   granted_at: string,
     *   status_changed_at: string
     * } $grant
     */
    private function initializeReplayBaselineForExistingGrant(array $grant): void
    {
        if ($this->transactionLocks->replayBaseline($grant['paddle_transaction_id']) !== null) {
            return;
        }

        $this->transactionLocks->initializeReplayBaseline(
            $grant['paddle_transaction_id'],
            $grant['status'],
            new \DateTimeImmutable($grant['status_changed_at']),
            '',
            true,
        );
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
     * (transaction_grants create()/replaceStatusFromReplay()) for this
     * user, on EVERY code path that can mutate a grant and then recompute
     * entitlement. This fixed
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
