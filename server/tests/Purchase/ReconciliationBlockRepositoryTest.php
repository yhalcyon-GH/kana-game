<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Purchase\ReconciliationBlockRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/PaddleEventTime.php';
require_once __DIR__ . '/../../src/Purchase/ReconciliationBlockRepository.php';

function makeReconciliationBlocksTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE paddle_reconciliation_blocks (
            paddle_event_id TEXT PRIMARY KEY,
            paddle_transaction_id TEXT NOT NULL,
            reason_code TEXT NOT NULL,
            action TEXT NOT NULL,
            adjustment_status TEXT NOT NULL,
            adjustment_type TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            force_exclude_transaction INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at TEXT NULL
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function reconciliationBlockRepositoryTests(): array
{
    return [
        'record is idempotent and retains a durable unresolved block' => function () {
            $pdo = makeReconciliationBlocksTestDb();
            $repo = new ReconciliationBlockRepository($pdo);
            $time = new \DateTimeImmutable('2026-01-02T00:00:00.100000Z');

            $repo->record('evt_1', 'txn_1', 'legacy_coarse_restore', 'chargeback_reverse', 'n/a', 'n/a', $time, true);
            $repo->record('evt_1', 'txn_1', 'replay_invariant', 'chargeback_reverse', 'n/a', 'n/a', $time, false);

            assertSame(1, $repo->countUnresolved(), 'duplicate event must not create a second quarantine row');
            $row = $repo->find('evt_1');
            assertSame('legacy_coarse_restore', $row['reason_code'], 'first durable reason must remain stable');
            assertTrue($row['force_exclude_transaction'], 'first conservative exclusion decision must remain stable');
        },

        'resolve removes the row from unresolved count without deleting its audit record' => function () {
            $repo = new ReconciliationBlockRepository(makeReconciliationBlocksTestDb());
            $repo->record(
                'evt_2',
                'txn_2',
                'materialized_history_divergence',
                'refund',
                'approved',
                'full',
                new \DateTimeImmutable('2026-01-02T00:00:00Z'),
                true,
            );
            $repo->resolve('evt_2');

            assertSame(0, $repo->countUnresolved(), 'resolved quarantine must leave the unresolved count');
            assertTrue($repo->find('evt_2')['resolved_at'] !== null, 'audit row must remain with resolved_at set');
        },
    ];
}
