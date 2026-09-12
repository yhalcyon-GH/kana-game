<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Purchase\PendingAdjustmentRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Purchase/PendingAdjustmentRepository.php';

function makePendingAdjustmentsTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE pending_adjustments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paddle_transaction_id TEXT NOT NULL,
            paddle_event_id TEXT NOT NULL UNIQUE,
            action TEXT NOT NULL,
            adjustment_status TEXT NOT NULL,
            adjustment_type TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            reconciled_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function pendingAdjustmentRepositoryTests(): array
{
    return [
        'queue() inserts an unreconciled pending adjustment' => function () {
            $repo = new PendingAdjustmentRepository(makePendingAdjustmentsTestDb());
            $repo->queue('txn_1', 'evt_1', 'refund', 'approved', 'full', new \DateTimeImmutable('2026-01-01 00:00:00'));

            $pending = $repo->findUnreconciledForTransaction('txn_1');
            assertSame(1, count($pending), 'exactly one unreconciled adjustment should be queued');
        },

        'queue() with a duplicate paddle_event_id is idempotent (no duplicate row, no throw)' => function () {
            $pdo = makePendingAdjustmentsTestDb();
            $repo = new PendingAdjustmentRepository($pdo);
            $repo->queue('txn_1', 'evt_dup', 'refund', 'approved', 'full', new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->queue('txn_1', 'evt_dup', 'refund', 'approved', 'full', new \DateTimeImmutable('2026-01-01 00:00:00'));

            $count = (int) $pdo->query('SELECT COUNT(*) FROM pending_adjustments')->fetchColumn();
            assertSame(1, $count, 'a duplicate event_id must not create a second row');
        },

        'findUnreconciledForTransaction() returns only unreconciled rows for the given transaction' => function () {
            $repo = new PendingAdjustmentRepository(makePendingAdjustmentsTestDb());
            $repo->queue('txn_1', 'evt_1', 'refund', 'pending_approval', 'full', new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->queue('txn_1', 'evt_2', 'refund', 'approved', 'full', new \DateTimeImmutable('2026-01-02 00:00:00'));
            $repo->queue('txn_2', 'evt_3', 'refund', 'approved', 'full', new \DateTimeImmutable('2026-01-01 00:00:00'));

            $pending = $repo->findUnreconciledForTransaction('txn_1');
            assertSame(2, count($pending), 'both queued adjustments for txn_1 should be returned');
            foreach ($pending as $row) {
                assertSame('txn_1', $row['paddle_transaction_id'], 'only txn_1 rows should be returned');
            }
        },

        'findUnreconciledForTransaction() orders results by occurred_at ascending (oldest first)' => function () {
            $repo = new PendingAdjustmentRepository(makePendingAdjustmentsTestDb());
            $repo->queue('txn_1', 'evt_newer', 'refund', 'approved', 'full', new \DateTimeImmutable('2026-01-05 00:00:00'));
            $repo->queue('txn_1', 'evt_older', 'refund', 'pending_approval', 'full', new \DateTimeImmutable('2026-01-01 00:00:00'));

            $pending = $repo->findUnreconciledForTransaction('txn_1');
            assertSame('evt_older', $pending[0]['paddle_event_id'], 'the older event should come first');
            assertSame('evt_newer', $pending[1]['paddle_event_id'], 'the newer event should come second');
        },

        'findUnreconciledForTransaction() excludes already-reconciled rows' => function () {
            $pdo = makePendingAdjustmentsTestDb();
            $repo = new PendingAdjustmentRepository($pdo);
            $repo->queue('txn_1', 'evt_1', 'refund', 'approved', 'full', new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->markReconciled('evt_1');

            $pending = $repo->findUnreconciledForTransaction('txn_1');
            assertSame(0, count($pending), 'a reconciled adjustment must not be returned again');
        },

        'markReconciled() sets reconciled_at for the given event id' => function () {
            $pdo = makePendingAdjustmentsTestDb();
            $repo = new PendingAdjustmentRepository($pdo);
            $repo->queue('txn_1', 'evt_1', 'refund', 'approved', 'full', new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->markReconciled('evt_1');

            $reconciledAt = $pdo->query("SELECT reconciled_at FROM pending_adjustments WHERE paddle_event_id = 'evt_1'")->fetchColumn();
            assertTrue($reconciledAt !== null && $reconciledAt !== false, 'reconciled_at should be set');
        },

        'isEventKnown() returns true for a previously queued event id, false otherwise' => function () {
            $repo = new PendingAdjustmentRepository(makePendingAdjustmentsTestDb());
            $repo->queue('txn_1', 'evt_1', 'refund', 'approved', 'full', new \DateTimeImmutable('2026-01-01 00:00:00'));

            assertTrue($repo->isEventKnown('evt_1'), 'a queued event should be known');
            assertFalse($repo->isEventKnown('evt_never_queued'), 'an unqueued event should not be known');
        },
    ];
}
