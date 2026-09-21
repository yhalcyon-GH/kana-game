<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Purchase\TransactionEventLockRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Purchase/TransactionEventLockRepository.php';

/**
 * @return array<string, callable(): void>
 */
function transactionEventLockRepositoryTests(): array
{
    return [
        'lock() creates one durable row per Paddle transaction and is idempotent' => function () {
            $pdo = new PDO('sqlite::memory:');
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->exec(
                'CREATE TABLE transaction_event_locks (
                    paddle_transaction_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )',
            );
            $repo = new TransactionEventLockRepository($pdo);

            $repo->lock('txn_1');
            $repo->lock('txn_1');
            $repo->lock('txn_2');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM transaction_event_locks')->fetchColumn();
            assertSame(2, $count, 'same transaction id must reuse one lock row while different ids remain independent');
        },
    ];
}
