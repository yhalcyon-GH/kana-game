<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

require_once __DIR__ . '/../PaddleEventTime.php';

use KanaGame\Paddle\PaddleEventTime;
use PDO;

/**
 * Reads/writes transaction_grants — one row per Paddle transaction that
 * ever granted entitlement, NOT one row per (user, product). This is
 * what makes refund attribution correct: a refund/adjustment for an OLD
 * transaction can only ever change ITS OWN row, never a later
 * transaction's grant for the same user/product.
 *
 * Entitlement-bearing statuses: 'active', 'refund_pending', except while the
 * transaction has an unresolved reconciliation block that explicitly forces
 * exclusion. Non-entitlement-bearing: 'refunded', 'chargeback', 'chargeback_pending'
 * (Phase H1-3 — see PurchaseWebhookHandler's chargeback-family handling).
 *
 * Grant status is materialized only from the deterministic replay reducer.
 * Per-event staleness/order decisions belong to that reducer, not this
 * repository write primitive.
 */
final class TransactionGrantRepository
{
    private const ENTITLEMENT_BEARING_STATUSES = ['active', 'refund_pending'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Returns true iff the grant was created. Returns false (does not
     * throw) for a duplicate paddle_transaction_id (idempotent
     * double-delivery) or a duplicate purchase_intent_id (a second
     * transaction attempting to claim an already-claimed intent) —
     * both are UNIQUE-constrained at the schema level; this method
     * treats either violation as "no-op, not an error."
     */
    public function create(
        string $paddleTransactionId,
        string $userId,
        string $productKey,
        int $purchaseIntentId,
        \DateTimeImmutable $occurredAt,
    ): bool {
        $occurredAtStr = PaddleEventTime::format($occurredAt);

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO transaction_grants
                    (paddle_transaction_id, user_id, product_key, purchase_intent_id, status, granted_at, status_changed_at, created_at, updated_at)
                 VALUES (:txn_id, :user_id, :product_key, :intent_id, :status, :granted_at, :status_changed_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            );
            $statement->execute([
                'txn_id' => $paddleTransactionId,
                'user_id' => $userId,
                'product_key' => $productKey,
                'intent_id' => $purchaseIntentId,
                'status' => 'active',
                'granted_at' => $occurredAtStr,
                'status_changed_at' => $occurredAtStr,
            ]);
            return true;
        } catch (\PDOException $e) {
            if ($this->isUniqueConstraintViolation($e)) {
                return false;
            }
            throw $e;
        }
    }

    /**
     * Callers MUST hold the caller's per-user serialization lock (see
     * PurchaseWebhookHandler::lockUserForEntitlementUpdate()) before
     * calling this, and this is the only entitlement-affecting read
     * that should follow it. On MariaDB this is a locking/current read
     * (FOR UPDATE): even after waiting for the per-user lock, this
     * transaction's own REPEATABLE READ snapshot -- established by an
     * earlier read, before the lock wait -- would otherwise still miss
     * a grant status change another transaction just committed while
     * this one was waiting. FOR UPDATE bypasses that snapshot and reads
     * the latest committed rows. SQLite has no comparable snapshot/
     * locking-read distinction for this codebase's usage and remains a
     * plain SELECT.
     */
    public function hasEntitlementBearingGrant(string $userId, string $productKey): bool
    {
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $placeholders = implode(',', array_fill(0, count(self::ENTITLEMENT_BEARING_STATUSES), '?'));
        $sql = "SELECT 1 FROM transaction_grants g
             WHERE g.user_id = ? AND g.product_key = ? AND g.status IN ({$placeholders})
               AND NOT EXISTS (
                   SELECT 1
                   FROM paddle_reconciliation_blocks b
                   WHERE b.paddle_transaction_id = g.paddle_transaction_id
                     AND b.resolved_at IS NULL
                     AND b.force_exclude_transaction = 1
               )
             LIMIT 1";
        if ($driver !== 'sqlite') {
            $sql .= ' FOR UPDATE';
        }
        $statement = $this->pdo->prepare($sql);
        $statement->execute([$userId, $productKey, ...self::ENTITLEMENT_BEARING_STATUSES]);

        return $statement->fetchColumn() !== false;
    }

    /**
     * Replaces the materialized grant status after replaying all normalized
     * history newer than this transaction's immutable replay baseline.
     *
     * Callers MUST hold both the per-transaction event lock and the per-user
     * entitlement lock. There is deliberately no "changed_at must only move
     * forward" predicate here: when a later-delivered OLDER event is inserted
     * into the complete post-baseline history, the correct derived final state
     * can change and its most recent status-changing event can legitimately be
     * earlier than the previously materialized changed_at. The fixed baseline
     * + full ordered replay, not arrival-time monotonicity, is the guard.
     */
    public function replaceStatusFromReplay(
        string $paddleTransactionId,
        string $status,
        \DateTimeImmutable $changedAt,
    ): bool {
        $statement = $this->pdo->prepare(
            'UPDATE transaction_grants
             SET status = :status, status_changed_at = :changed_at
             WHERE paddle_transaction_id = :txn_id',
        );
        $statement->execute([
            'status' => $status,
            'changed_at' => PaddleEventTime::format($changedAt),
            'txn_id' => $paddleTransactionId,
        ]);

        return $statement->rowCount() === 1;
    }

    /**
     * @return array{
     *   paddle_transaction_id: string,
     *   user_id: string,
     *   product_key: string,
     *   purchase_intent_id: int,
     *   status: string,
     *   granted_at: string,
     *   status_changed_at: string
     * }|null
     */
    public function findByTransactionId(string $paddleTransactionId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT paddle_transaction_id, user_id, product_key, purchase_intent_id, status, granted_at, status_changed_at
             FROM transaction_grants WHERE paddle_transaction_id = :txn_id LIMIT 1',
        );
        $statement->execute(['txn_id' => $paddleTransactionId]);
        /** @var array{paddle_transaction_id: string, user_id: string, product_key: string, purchase_intent_id: int, status: string, granted_at: string, status_changed_at: string}|false $row */
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    private function isUniqueConstraintViolation(\PDOException $e): bool
    {
        return $e->getCode() === '23000' || str_contains($e->getMessage(), 'UNIQUE constraint failed');
    }
}
