<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

use PDO;

/**
 * Per-Paddle-transaction serialization point for distinct webhook event ids.
 *
 * PaymentEventRepository serializes duplicate delivery of the SAME event id.
 * This repository serializes DIFFERENT event ids that affect the same Paddle
 * transaction (e.g. transaction.completed racing a refund). On MariaDB the
 * durable lock row is selected FOR UPDATE inside the webhook transaction.
 * Different Paddle transaction ids lock different rows and remain concurrent.
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
}
