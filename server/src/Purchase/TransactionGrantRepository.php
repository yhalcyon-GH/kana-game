<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

use PDO;

/**
 * Reads/writes transaction_grants — one row per Paddle transaction that
 * ever granted entitlement, NOT one row per (user, product). This is
 * what makes refund attribution correct: a refund/adjustment for an OLD
 * transaction can only ever change ITS OWN row, never a later
 * transaction's grant for the same user/product.
 *
 * Entitlement-bearing statuses: 'active', 'refund_pending'.
 * Non-entitlement-bearing: 'refunded', 'chargeback', 'chargeback_pending'
 * (Phase H1-3 — see PurchaseWebhookHandler's chargeback-family handling).
 *
 * updateStatus() discards a stale (older occurred_at) transition so a
 * late-arriving out-of-order event can never undo a newer one.
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
        $occurredAtStr = $occurredAt->format('Y-m-d H:i:s');

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
     * Applies a status transition ONLY if $occurredAt is not older than
     * the grant's current status_changed_at — a stale out-of-order
     * event is discarded (returns false) rather than overwriting a
     * newer status. Returns false for an unknown transaction id.
     *
     * Phase H1-3: $allowedFromStatuses, when given, adds a second,
     * INDEPENDENT guard alongside the occurred_at staleness check: the
     * transition is only applied if the grant's CURRENT status is one
     * of the listed values. This is what makes chargeback_reverse and
     * chargeback_warning_reverse safe -- without it, an occurred_at
     * that merely postdates a *previous* status_changed_at would be
     * enough to blindly restore 'active' from ANY current status,
     * including an already-finalized 'refunded' grant. With it, e.g.
     * chargeback_reverse can only ever fire from 'chargeback' (never
     * from 'refunded', never from 'chargeback_pending' -- that pairs
     * exclusively with chargeback_warning_reverse). Omitted (null,
     * the default) for the existing refund transitions, which are
     * unrestricted by source status, preserving their current
     * behavior exactly.
     *
     * @param list<string>|null $allowedFromStatuses
     */
    public function updateStatus(
        string $paddleTransactionId,
        string $newStatus,
        \DateTimeImmutable $occurredAt,
        ?array $allowedFromStatuses = null,
    ): bool {
        $occurredAtStr = $occurredAt->format('Y-m-d H:i:s');
        $params = [
            'status' => $newStatus,
            'occurred_at' => $occurredAtStr,
            'txn_id' => $paddleTransactionId,
            'occurred_at2' => $occurredAtStr,
        ];

        $sql = 'UPDATE transaction_grants
                SET status = :status, status_changed_at = :occurred_at
                WHERE paddle_transaction_id = :txn_id AND status_changed_at <= :occurred_at2';

        if ($allowedFromStatuses !== null) {
            $placeholders = [];
            foreach (array_values($allowedFromStatuses) as $index => $fromStatus) {
                $key = "from_status_{$index}";
                $placeholders[] = ":{$key}";
                $params[$key] = $fromStatus;
            }
            $sql .= ' AND status IN (' . implode(',', $placeholders) . ')';
        }

        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);

        return $statement->rowCount() === 1;
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
        $sql = "SELECT 1 FROM transaction_grants
             WHERE user_id = ? AND product_key = ? AND status IN ({$placeholders})
             LIMIT 1";
        if ($driver !== 'sqlite') {
            $sql .= ' FOR UPDATE';
        }
        $statement = $this->pdo->prepare($sql);
        $statement->execute([$userId, $productKey, ...self::ENTITLEMENT_BEARING_STATUSES]);

        return $statement->fetchColumn() !== false;
    }

    /**
     * @return array{paddle_transaction_id: string, user_id: string, product_key: string, purchase_intent_id: int, status: string}|null
     */
    public function findByTransactionId(string $paddleTransactionId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT paddle_transaction_id, user_id, product_key, purchase_intent_id, status
             FROM transaction_grants WHERE paddle_transaction_id = :txn_id LIMIT 1',
        );
        $statement->execute(['txn_id' => $paddleTransactionId]);
        /** @var array{paddle_transaction_id: string, user_id: string, product_key: string, purchase_intent_id: int, status: string}|false $row */
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    private function isUniqueConstraintViolation(\PDOException $e): bool
    {
        return $e->getCode() === '23000' || str_contains($e->getMessage(), 'UNIQUE constraint failed');
    }
}
