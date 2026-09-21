<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Purchase\TransactionGrantRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Purchase/TransactionGrantRepository.php';

function makeTransactionGrantsTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE transaction_grants (
            paddle_transaction_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            product_key TEXT NOT NULL,
            purchase_intent_id INTEGER NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT "active",
            granted_at TEXT NOT NULL,
            status_changed_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function transactionGrantRepositoryTests(): array
{
    return [
        'create() inserts an active grant' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $occurredAt = new \DateTimeImmutable('2026-01-01 00:00:00');
            $created = $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, $occurredAt);

            assertTrue($created, 'create() should succeed for a brand-new transaction id');
            assertTrue($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'a freshly created grant should be entitlement-bearing');
        },

        'create() fails (returns false, does not throw) for a duplicate purchase_intent_id -- UNIQUE(purchase_intent_id) enforced' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $occurredAt = new \DateTimeImmutable('2026-01-01 00:00:00');
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, $occurredAt);

            $secondCreated = $repo->create('txn_2', 'user-1', 'full_tamamizu', 1, $occurredAt);
            assertFalse($secondCreated, 'a second transaction must never attach to an already-claimed purchase_intent_id');
        },

        'create() fails for a duplicate paddle_transaction_id (idempotent double-delivery)' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $occurredAt = new \DateTimeImmutable('2026-01-01 00:00:00');
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, $occurredAt);

            $secondCreated = $repo->create('txn_1', 'user-1', 'full_tamamizu', 2, $occurredAt);
            assertFalse($secondCreated, 'the same transaction id must never create a second grant row');
        },

        'hasEntitlementBearingGrant() reflects replay-materialized status' => function () {
            $pdo = makeTransactionGrantsTestDb();
            $repo = new TransactionGrantRepository($pdo);
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, new \DateTimeImmutable('2026-01-01 00:00:00'));

            $repo->replaceStatusFromReplay('txn_1', 'refund_pending', new \DateTimeImmutable('2026-01-02 00:00:00'));
            assertTrue($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'refund_pending must still count as entitled');

            $repo->replaceStatusFromReplay('txn_1', 'refunded', new \DateTimeImmutable('2026-01-03 00:00:00'));
            assertFalse($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'refunded must not count as entitled');
        },

        'replaceStatusFromReplay() may move changed_at backward when full replay corrects an arrival-order materialization' => function () {
            $pdo = makeTransactionGrantsTestDb();
            $repo = new TransactionGrantRepository($pdo);
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, new \DateTimeImmutable('2026-01-01 00:00:00'));

            $repo->replaceStatusFromReplay('txn_1', 'chargeback_pending', new \DateTimeImmutable('2026-01-05 00:00:00'));
            $repo->replaceStatusFromReplay('txn_1', 'chargeback', new \DateTimeImmutable('2026-01-02 00:00:00'));

            $grant = $repo->findByTransactionId('txn_1');
            assertSame('chargeback', $grant['status'], 'full replay must be able to correct the derived status');
            assertSame('2026-01-02 00:00:00.000000', $grant['status_changed_at'], 'derived status timestamp may legitimately move backward after an older event arrives');
        },

        'create() preserves fractional Paddle event time and replay replacement keeps microsecond precision' => function () {
            $pdo = makeTransactionGrantsTestDb();
            $repo = new TransactionGrantRepository($pdo);
            $repo->create(
                'txn_micro',
                'user-1',
                'full_tamamizu',
                1,
                new \DateTimeImmutable('2026-01-01T00:00:00.100000Z'),
            );

            $grant = $repo->findByTransactionId('txn_micro');
            assertSame('2026-01-01 00:00:00.100000', $grant['granted_at'], 'granted_at must keep microseconds');

            $repo->replaceStatusFromReplay(
                'txn_micro',
                'refunded',
                new \DateTimeImmutable('2026-01-01T00:00:00.900000Z'),
            );
            $grant = $repo->findByTransactionId('txn_micro');
            assertSame('refunded', $grant['status'], 'replay replacement should set derived status');
            assertSame('2026-01-01 00:00:00.900000', $grant['status_changed_at'], 'status_changed_at must keep microseconds');
        },

        'findByTransactionId() returns the grant row for a known transaction and null otherwise' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $occurredAt = new \DateTimeImmutable('2026-01-01 00:00:00');
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, $occurredAt);

            $grant = $repo->findByTransactionId('txn_1');
            assertTrue($grant !== null, 'a known transaction id should resolve');
            assertSame('user-1', $grant['user_id'], 'user_id should match');
            assertSame('active', $grant['status'], 'status should be active on creation');
            assertSame(null, $repo->findByTransactionId('txn_unknown'), 'unknown transaction id should return null');
        },

        'repurchase scenario: refunding transaction A leaves transaction B entitlement-bearing' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $repo->create('txn_A', 'user-1', 'full_tamamizu', 1, new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->create('txn_B', 'user-1', 'full_tamamizu', 2, new \DateTimeImmutable('2026-01-05 00:00:00'));

            $repo->replaceStatusFromReplay('txn_A', 'refunded', new \DateTimeImmutable('2026-01-10 00:00:00'));

            assertTrue($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'B must keep the user entitled after A is refunded');
            assertSame('active', $repo->findByTransactionId('txn_B')['status'], 'B must be untouched by A\'s refund');
        },

        'refund for one user cannot affect another user entitlement' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $repo->create('txn_user1', 'user-1', 'full_tamamizu', 1, new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->create('txn_user2', 'user-2', 'full_tamamizu', 2, new \DateTimeImmutable('2026-01-01 00:00:00'));

            $repo->replaceStatusFromReplay('txn_user1', 'refunded', new \DateTimeImmutable('2026-01-02 00:00:00'));

            assertFalse($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'user-1 should be revoked');
            assertTrue($repo->hasEntitlementBearingGrant('user-2', 'full_tamamizu'), 'user-2 must be unaffected by user-1\'s refund');
        },
    ];
}
