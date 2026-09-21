<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

require_once __DIR__ . '/../PaddleEventTime.php';

use KanaGame\Paddle\PaddleEventTime;
use PDO;

/**
 * Durable dead-letter/quarantine records for reconciliation invariants that
 * cannot be safely auto-resolved. Rows contain no customer PII or payloads.
 *
 * An unresolved row with force_exclude_transaction=1 makes that Paddle
 * transaction non-entitlement-bearing in TransactionGrantRepository even if
 * its legacy materialized grant row still says active/refund_pending.
 */
final class ReconciliationBlockRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function record(
        string $paddleEventId,
        string $paddleTransactionId,
        string $reasonCode,
        string $action,
        string $adjustmentStatus,
        string $adjustmentType,
        \DateTimeImmutable $occurredAt,
        bool $forceExcludeTransaction,
    ): void {
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sql = $driver === 'sqlite'
            ? 'INSERT INTO paddle_reconciliation_blocks
                 (paddle_event_id, paddle_transaction_id, reason_code, action, adjustment_status, adjustment_type, occurred_at, force_exclude_transaction, created_at)
               VALUES (:event_id, :txn_id, :reason, :action, :status, :type, :occurred_at, :force_exclude, CURRENT_TIMESTAMP)
               ON CONFLICT(paddle_event_id) DO NOTHING'
            : 'INSERT INTO paddle_reconciliation_blocks
                 (paddle_event_id, paddle_transaction_id, reason_code, action, adjustment_status, adjustment_type, occurred_at, force_exclude_transaction, created_at)
               VALUES (:event_id, :txn_id, :reason, :action, :status, :type, :occurred_at, :force_exclude, NOW())
               ON DUPLICATE KEY UPDATE paddle_event_id = VALUES(paddle_event_id)';

        $statement = $this->pdo->prepare($sql);
        $statement->execute([
            'event_id' => $paddleEventId,
            'txn_id' => $paddleTransactionId,
            'reason' => $reasonCode,
            'action' => $action,
            'status' => $adjustmentStatus,
            'type' => $adjustmentType,
            'occurred_at' => PaddleEventTime::format($occurredAt),
            'force_exclude' => $forceExcludeTransaction ? 1 : 0,
        ]);
    }

    public function countUnresolved(): int
    {
        return (int) $this->pdo->query(
            'SELECT COUNT(*) FROM paddle_reconciliation_blocks WHERE resolved_at IS NULL',
        )->fetchColumn();
    }

    public function resolve(string $paddleEventId): void
    {
        $now = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW(6)';
        $statement = $this->pdo->prepare(
            "UPDATE paddle_reconciliation_blocks
             SET resolved_at = COALESCE(resolved_at, {$now})
             WHERE paddle_event_id = :event_id",
        );
        $statement->execute(['event_id' => $paddleEventId]);
    }

    /**
     * @return array{paddle_event_id:string,paddle_transaction_id:string,reason_code:string,force_exclude_transaction:bool,resolved_at:?string}|null
     */
    public function find(string $paddleEventId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT paddle_event_id, paddle_transaction_id, reason_code, force_exclude_transaction, resolved_at
             FROM paddle_reconciliation_blocks
             WHERE paddle_event_id = :event_id
             LIMIT 1',
        );
        $statement->execute(['event_id' => $paddleEventId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return null;
        }
        return [
            'paddle_event_id' => $row['paddle_event_id'],
            'paddle_transaction_id' => $row['paddle_transaction_id'],
            'reason_code' => $row['reason_code'],
            'force_exclude_transaction' => ((int) $row['force_exclude_transaction']) === 1,
            'resolved_at' => is_string($row['resolved_at'] ?? null) ? $row['resolved_at'] : null,
        ];
    }
}
