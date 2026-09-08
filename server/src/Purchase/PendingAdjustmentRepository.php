<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

use PDO;

/**
 * Reads/writes pending_adjustments — the out-of-order-webhook queue.
 * Paddle does not guarantee delivery order: an adjustment.* event can
 * arrive before the transaction.completed event it refers to. Such an
 * adjustment is queued here (no entitlement effect yet) and reconciled
 * once the matching transaction_grants row is created.
 */
final class PendingAdjustmentRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Idempotent — a duplicate paddle_event_id is a safe no-op, not an
     * error (Paddle may redeliver the same event).
     */
    public function queue(
        string $paddleTransactionId,
        string $paddleEventId,
        string $action,
        string $adjustmentStatus,
        string $adjustmentType,
        \DateTimeImmutable $occurredAt,
    ): void {
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sql = $driver === 'sqlite'
            ? 'INSERT OR IGNORE INTO pending_adjustments
                (paddle_transaction_id, paddle_event_id, action, adjustment_status, adjustment_type, occurred_at, created_at)
               VALUES (:txn_id, :event_id, :action, :status, :type, :occurred_at, CURRENT_TIMESTAMP)'
            : 'INSERT INTO pending_adjustments
                (paddle_transaction_id, paddle_event_id, action, adjustment_status, adjustment_type, occurred_at, created_at)
               VALUES (:txn_id, :event_id, :action, :status, :type, :occurred_at, NOW())
               ON DUPLICATE KEY UPDATE paddle_event_id = paddle_event_id';

        $statement = $this->pdo->prepare($sql);
        $statement->execute([
            'txn_id' => $paddleTransactionId,
            'event_id' => $paddleEventId,
            'action' => $action,
            'status' => $adjustmentStatus,
            'type' => $adjustmentType,
            'occurred_at' => $occurredAt->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Returns unreconciled adjustments for a transaction, ordered by
     * occurred_at ascending (oldest first) — reconciliation applies
     * them in the order Paddle says they actually happened, not
     * arrival order.
     *
     * @return list<array{id: int, paddle_transaction_id: string, paddle_event_id: string, action: string, adjustment_status: string, adjustment_type: string, occurred_at: string}>
     */
    public function findUnreconciledForTransaction(string $paddleTransactionId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, paddle_transaction_id, paddle_event_id, action, adjustment_status, adjustment_type, occurred_at
             FROM pending_adjustments
             WHERE paddle_transaction_id = :txn_id AND reconciled_at IS NULL
             ORDER BY occurred_at ASC',
        );
        $statement->execute(['txn_id' => $paddleTransactionId]);

        /** @var list<array{id: int, paddle_transaction_id: string, paddle_event_id: string, action: string, adjustment_status: string, adjustment_type: string, occurred_at: string}> */
        return $statement->fetchAll();
    }

    public function markReconciled(string $paddleEventId): void
    {
        $nowExpression = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';

        $statement = $this->pdo->prepare(
            "UPDATE pending_adjustments SET reconciled_at = {$nowExpression} WHERE paddle_event_id = :event_id",
        );
        $statement->execute(['event_id' => $paddleEventId]);
    }

    public function isEventKnown(string $paddleEventId): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT 1 FROM pending_adjustments WHERE paddle_event_id = :event_id LIMIT 1',
        );
        $statement->execute(['event_id' => $paddleEventId]);

        return $statement->fetchColumn() !== false;
    }
}
