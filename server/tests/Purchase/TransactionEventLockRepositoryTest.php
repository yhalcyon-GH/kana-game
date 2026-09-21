<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Purchase\TransactionEventLockRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/PaddleEventTime.php';
require_once __DIR__ . '/../../src/Purchase/TransactionEventLockRepository.php';

function makeTransactionEventLockTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE transaction_event_locks (
            paddle_transaction_id TEXT PRIMARY KEY,
            replay_base_status TEXT NULL,
            replay_base_at TEXT NULL,
            replay_base_event_id TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function transactionEventLockRepositoryTests(): array
{
    return [
        'lock() creates one durable row per Paddle transaction and is idempotent' => function () {
            $pdo = makeTransactionEventLockTestDb();
            $repo = new TransactionEventLockRepository($pdo);

            $repo->lock('txn_1');
            $repo->lock('txn_1');
            $repo->lock('txn_2');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM transaction_event_locks')->fetchColumn();
            assertSame(2, $count, 'same transaction id must reuse one lock row while different ids remain independent');
        },

        'replay baseline initializes once and later calls cannot move it' => function () {
            $pdo = makeTransactionEventLockTestDb();
            $repo = new TransactionEventLockRepository($pdo);
            $repo->lock('txn_1');

            assertSame(null, $repo->replayBaseline('txn_1'), 'fresh lock row must have no replay baseline');

            $repo->initializeReplayBaseline(
                'txn_1',
                'chargeback',
                new \DateTimeImmutable('2026-01-02T00:00:00.100000Z'),
                'evt_old',
            );
            $repo->initializeReplayBaseline(
                'txn_1',
                'active',
                new \DateTimeImmutable('2026-01-05T00:00:00.900000Z'),
                'evt_must_not_replace',
            );

            $baseline = $repo->replayBaseline('txn_1');
            assertSame('chargeback', $baseline['status'], 'first baseline status must remain immutable');
            assertSame('2026-01-02 00:00:00.100000', $baseline['occurred_at'], 'first baseline timestamp must remain immutable');
            assertSame('evt_old', $baseline['paddle_event_id'], 'first baseline event id must remain immutable');
        },
    ];
}
