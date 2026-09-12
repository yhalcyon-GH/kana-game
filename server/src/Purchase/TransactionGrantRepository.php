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
 * Non-entitlement-bearing: 'refunded'. Chargeback statuses are reserved
 * in the schema but never written by this class in PR B — chargeback/
 * dispute handling remains explicitly deferred.
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
     */
    public function updateStatus(string $paddleTransactionId, string $newStatus, \DateTimeImmutable $occurredAt): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE transaction_grants
             SET status = :status, status_changed_at = :occurred_at
             WHERE paddle_transaction_id = :txn_id AND status_changed_at <= :occurred_at2',
        );
        $occurredAtStr = $occurredAt->format('Y-m-d H:i:s');
        $statement->execute([
            'status' => $newStatus,
            'occurred_at' => $occurredAtStr,
            'txn_id' => $paddleTransactionId,
            'occurred_at2' => $occurredAtStr,
        ]);

        return $statement->rowCount() === 1;
    }

    public function hasEntitlementBearingGrant(string $userId, string $productKey): bool
    {
        $placeholders = implode(',', array_fill(0, count(self::ENTITLEMENT_BEARING_STATUSES), '?'));
        $statement = $this->pdo->prepare(
            "SELECT 1 FROM transaction_grants
             WHERE user_id = ? AND product_key = ? AND status IN ({$placeholders})
             LIMIT 1",
        );
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
