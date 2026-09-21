<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

require_once __DIR__ . '/../PaddleEventTime.php';

use KanaGame\Paddle\PaddleEventTime;
use PDO;

/**
 * Per-Paddle-transaction serialization plus replay-baseline metadata.
 *
 * PaymentEventRepository serializes duplicate delivery of the SAME event id.
 * This repository serializes DIFFERENT event ids that affect the same Paddle
 * transaction (e.g. transaction.completed racing a refund). On MariaDB the
 * durable row is selected FOR UPDATE inside the webhook transaction.
 * Different Paddle transaction ids lock different rows and remain concurrent.
 *
 * The same durable row also stores a one-time replay baseline. Pre-0009 code
 * did not retain normalized payload history for adjustments delivered after a
 * grant already existed, so replaying every retained row from an assumed
 * "active" origin can corrupt legacy materialized state. The baseline snapshots
 * that already-materialized state once, under this row lock, and never moves.
 */
final class TransactionEventLockRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function lock(string $paddleTransactionId): void
    {
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);

        if ($driver === 'sqlite') {
            $insert = $this->pdo->prepare(
                'INSERT OR IGNORE INTO transaction_event_locks (paddle_transaction_id, created_at)
                 VALUES (:txn_id, CURRENT_TIMESTAMP)',
            );
            $insert->execute(['txn_id' => $paddleTransactionId]);

            // SQLite unit tests are single-connection/sequential. Touching the
            // exact row still verifies the repository contract without using
            // unsupported FOR UPDATE syntax.
            $select = $this->pdo->prepare(
                'SELECT paddle_transaction_id
                 FROM transaction_event_locks
                 WHERE paddle_transaction_id = :txn_id
                 LIMIT 1',
            );
            $select->execute(['txn_id' => $paddleTransactionId]);
            $select->fetchColumn();
            return;
        }

        $insert = $this->pdo->prepare(
            'INSERT INTO transaction_event_locks (paddle_transaction_id, created_at)
             VALUES (:txn_id, NOW())
             ON DUPLICATE KEY UPDATE paddle_transaction_id = VALUES(paddle_transaction_id)',
        );
        $insert->execute(['txn_id' => $paddleTransactionId]);

        // Latest-committed locking read: after waiting for another event on
        // this same transaction, do not continue in an older REPEATABLE READ
        // snapshot.
        $select = $this->pdo->prepare(
            'SELECT paddle_transaction_id
             FROM transaction_event_locks
             WHERE paddle_transaction_id = :txn_id
             FOR UPDATE',
        );
        $select->execute(['txn_id' => $paddleTransactionId]);
        $select->fetchColumn();
    }

    /**
     * Initializes the immutable replay baseline exactly once.
     *
     * Caller MUST already hold lock() for this Paddle transaction. A second
     * call is intentionally a no-op so later webhook deliveries cannot move
     * the cutover point or replace the state snapshot.
     */
    public function initializeReplayBaseline(
        string $paddleTransactionId,
        string $status,
        \DateTimeImmutable $baselineAt,
        string $baselineEventId,
    ): void {
        $statement = $this->pdo->prepare(
            'UPDATE transaction_event_locks
             SET replay_base_status = :status,
                 replay_base_at = :baseline_at,
                 replay_base_event_id = :baseline_event_id
             WHERE paddle_transaction_id = :txn_id
               AND replay_base_status IS NULL',
        );
        $statement->execute([
            'status' => $status,
            'baseline_at' => PaddleEventTime::format($baselineAt),
            'baseline_event_id' => $baselineEventId,
            'txn_id' => $paddleTransactionId,
        ]);
    }

    /**
     * @return array{status: string, occurred_at: string, paddle_event_id: string}|null
     */
    public function replayBaseline(string $paddleTransactionId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT replay_base_status, replay_base_at, replay_base_event_id
             FROM transaction_event_locks
             WHERE paddle_transaction_id = :txn_id
             LIMIT 1',
        );
        $statement->execute(['txn_id' => $paddleTransactionId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        if (!is_array($row)
            || !is_string($row['replay_base_status'] ?? null)
            || !is_string($row['replay_base_at'] ?? null)
            || !is_string($row['replay_base_event_id'] ?? null)
        ) {
            return null;
        }

        return [
            'status' => $row['replay_base_status'],
            'occurred_at' => $row['replay_base_at'],
            'paddle_event_id' => $row['replay_base_event_id'],
        ];
    }
}
