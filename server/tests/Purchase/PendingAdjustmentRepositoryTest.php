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
            items_json TEXT NULL,
            occurred_at TEXT NOT NULL,
            reconciled_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE transaction_grants (
            paddle_transaction_id TEXT PRIMARY KEY
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
            $repo->queue('txn_1', 'evt_1', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01 00:00:00'));

            $pending = $repo->findUnreconciledForTransaction('txn_1');
            assertSame(1, count($pending), 'exactly one unreconciled adjustment should be queued');
        },

        'queue() with a duplicate paddle_event_id is idempotent (no duplicate row, no throw)' => function () {
            $pdo = makePendingAdjustmentsTestDb();
            $repo = new PendingAdjustmentRepository($pdo);
            $repo->queue('txn_1', 'evt_dup', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->queue('txn_1', 'evt_dup', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01 00:00:00'));

            $count = (int) $pdo->query('SELECT COUNT(*) FROM pending_adjustments')->fetchColumn();
            assertSame(1, $count, 'a duplicate event_id must not create a second row');
        },

        'findUnreconciledForTransaction() returns only unreconciled rows for the given transaction' => function () {
            $repo = new PendingAdjustmentRepository(makePendingAdjustmentsTestDb());
            $repo->queue('txn_1', 'evt_1', 'refund', 'pending_approval', 'full', null, new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->queue('txn_1', 'evt_2', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-02 00:00:00'));
            $repo->queue('txn_2', 'evt_3', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01 00:00:00'));

            $pending = $repo->findUnreconciledForTransaction('txn_1');
            assertSame(2, count($pending), 'both queued adjustments for txn_1 should be returned');
            foreach ($pending as $row) {
                assertSame('txn_1', $row['paddle_transaction_id'], 'only txn_1 rows should be returned');
            }
        },

        'findUnreconciledForTransaction() orders results by occurred_at ascending (oldest first)' => function () {
            $repo = new PendingAdjustmentRepository(makePendingAdjustmentsTestDb());
            $repo->queue('txn_1', 'evt_newer', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-05 00:00:00'));
            $repo->queue('txn_1', 'evt_older', 'refund', 'pending_approval', 'full', null, new \DateTimeImmutable('2026-01-01 00:00:00'));

            $pending = $repo->findUnreconciledForTransaction('txn_1');
            assertSame('evt_older', $pending[0]['paddle_event_id'], 'the older event should come first');
            assertSame('evt_newer', $pending[1]['paddle_event_id'], 'the newer event should come second');
        },

        'findUnreconciledForTransaction() excludes already-reconciled rows' => function () {
            $pdo = makePendingAdjustmentsTestDb();
            $repo = new PendingAdjustmentRepository($pdo);
            $repo->queue('txn_1', 'evt_1', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->markReconciled('evt_1');

            $pending = $repo->findUnreconciledForTransaction('txn_1');
            assertSame(0, count($pending), 'a reconciled adjustment must not be returned again');
        },

        'markReconciled() sets reconciled_at for the given event id' => function () {
            $pdo = makePendingAdjustmentsTestDb();
            $repo = new PendingAdjustmentRepository($pdo);
            $repo->queue('txn_1', 'evt_1', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->markReconciled('evt_1');

            $reconciledAt = $pdo->query("SELECT reconciled_at FROM pending_adjustments WHERE paddle_event_id = 'evt_1'")->fetchColumn();
            assertTrue($reconciledAt !== null && $reconciledAt !== false, 'reconciled_at should be set');
        },

        'findAllForTransaction() retains reconciled history and orders equal-second events by precise timestamp then event id' => function () {
            $pdo = makePendingAdjustmentsTestDb();
            $repo = new PendingAdjustmentRepository($pdo);
            $repo->queue('txn_hist', 'evt_z', 'refund', 'pending_approval', 'full', null, new \DateTimeImmutable('2026-01-01T00:00:00.100000Z'));
            $repo->queue('txn_hist', 'evt_a', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01T00:00:00.900000Z'));
            $repo->markAllReconciledForTransaction('txn_hist');

            $history = $repo->findAllForTransaction('txn_hist');
            assertSame(2, count($history), 'reconciled rows must remain replayable history');
            assertSame('evt_z', $history[0]['paddle_event_id'], 'the .100000 event must sort before .900000');
            assertSame('2026-01-01 00:00:00.100000', $history[0]['occurred_at'], 'fractional timestamp must be preserved');
            assertSame('2026-01-01 00:00:00.900000', $history[1]['occurred_at'], 'later fractional timestamp must be preserved');
            assertSame(0, count($repo->findUnreconciledForTransaction('txn_hist')), 'markAllReconciled should only change bookkeeping, not delete history');
        },

        'findAllForTransaction() uses paddle_event_id as a deterministic exact-timestamp tie breaker' => function () {
            $repo = new PendingAdjustmentRepository(makePendingAdjustmentsTestDb());
            $same = new \DateTimeImmutable('2026-01-01T00:00:00.500000Z');
            $repo->queue('txn_tie', 'evt_z', 'refund', 'pending_approval', 'full', null, $same);
            $repo->queue('txn_tie', 'evt_a', 'refund', 'approved', 'full', null, $same);

            $history = $repo->findAllForTransaction('txn_tie');
            assertSame('evt_a', $history[0]['paddle_event_id'], 'event-id order must not depend on delivery order when timestamps are identical');
            assertSame('evt_z', $history[1]['paddle_event_id'], 'stable event-id tie breaker should be deterministic');
        },

        'cutover inventory returns only unreconciled transactions that already have grants' => function () {
            $pdo = makePendingAdjustmentsTestDb();
            $repo = new PendingAdjustmentRepository($pdo);
            $repo->queue('txn_with_grant', 'evt_cutover_1', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01T00:00:00Z'));
            $repo->queue('txn_without_grant', 'evt_cutover_2', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01T00:00:00Z'));
            $pdo->exec("INSERT INTO transaction_grants (paddle_transaction_id) VALUES ('txn_with_grant')");

            assertSame(
                ['txn_with_grant'],
                $repo->findUnreconciledTransactionIdsWithGrant(),
                'adjustment-before-transaction rows without grants are not cutover defects',
            );

            $repo->markAllReconciledForTransaction('txn_with_grant');
            assertSame([], $repo->findUnreconciledTransactionIdsWithGrant(), 'reconciled grant-backed rows must leave the cutover inventory');
        },

        'findReconciledForTransaction() excludes newly queued rows while retaining materialized history' => function () {
            $pdo = makePendingAdjustmentsTestDb();
            $repo = new PendingAdjustmentRepository($pdo);
            $repo->queue('txn_hist2', 'evt_old', 'refund', 'pending_approval', 'full', null, new \DateTimeImmutable('2026-01-01T00:00:00Z'));
            $repo->markReconciled('evt_old');
            $repo->queue('txn_hist2', 'evt_new', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-02T00:00:00Z'));

            $history = $repo->findReconciledForTransaction('txn_hist2');
            assertSame(1, count($history), 'only previously materialized history belongs in the divergence guard');
            assertSame('evt_old', $history[0]['paddle_event_id'], 'newly queued row must be excluded until replay succeeds');
        },

        'isEventKnown() returns true for a previously queued event id, false otherwise' => function () {
            $repo = new PendingAdjustmentRepository(makePendingAdjustmentsTestDb());
            $repo->queue('txn_1', 'evt_1', 'refund', 'approved', 'full', null, new \DateTimeImmutable('2026-01-01 00:00:00'));

            assertTrue($repo->isEventKnown('evt_1'), 'a queued event should be known');
            assertFalse($repo->isEventKnown('evt_never_queued'), 'an unqueued event should not be known');
        },
    ];
}
