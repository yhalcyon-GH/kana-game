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

        'hasEntitlementBearingGrant() returns false when no grant exists' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            assertFalse($repo->hasEntitlementBearingGrant('user-none', 'full_tamamizu'), 'no grant should mean not entitled');
        },

        'hasEntitlementBearingGrant() returns true for refund_pending status (entitlement-bearing)' => function () {
            $pdo = makeTransactionGrantsTestDb();
            $repo = new TransactionGrantRepository($pdo);
            $occurredAt = new \DateTimeImmutable('2026-01-01 00:00:00');
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, $occurredAt);
            $repo->updateStatus('txn_1', 'refund_pending', new \DateTimeImmutable('2026-01-02 00:00:00'));

            assertTrue($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'refund_pending must still count as entitled');
        },

        'hasEntitlementBearingGrant() returns false for refunded status (not entitlement-bearing)' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $occurredAt = new \DateTimeImmutable('2026-01-01 00:00:00');
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, $occurredAt);
            $repo->updateStatus('txn_1', 'refunded', new \DateTimeImmutable('2026-01-02 00:00:00'));

            assertFalse($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'refunded must not count as entitled');
        },

        'updateStatus() applies a newer status transition' => function () {
            $pdo = makeTransactionGrantsTestDb();
            $repo = new TransactionGrantRepository($pdo);
            $occurredAt = new \DateTimeImmutable('2026-01-01 00:00:00');
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, $occurredAt);

            $applied = $repo->updateStatus('txn_1', 'refunded', new \DateTimeImmutable('2026-01-02 00:00:00'));
            assertTrue($applied, 'a newer status transition should be applied');

            $status = $pdo->query("SELECT status FROM transaction_grants WHERE paddle_transaction_id = 'txn_1'")->fetchColumn();
            assertSame('refunded', $status, 'status should now be refunded');
        },

        'updateStatus() discards a STALE (older occurred_at) status transition' => function () {
            $pdo = makeTransactionGrantsTestDb();
            $repo = new TransactionGrantRepository($pdo);
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, new \DateTimeImmutable('2026-01-01 00:00:00'));
            // Newest known transition: refunded at 2026-01-03.
            $repo->updateStatus('txn_1', 'refunded', new \DateTimeImmutable('2026-01-03 00:00:00'));

            // A stale event (occurred_at 2026-01-02, older than the
            // current status_changed_at of 2026-01-03) tries to move it
            // back to refund_pending -- must be discarded.
            $applied = $repo->updateStatus('txn_1', 'refund_pending', new \DateTimeImmutable('2026-01-02 00:00:00'));
            assertFalse($applied, 'a stale (older) event must not be applied');

            $status = $pdo->query("SELECT status FROM transaction_grants WHERE paddle_transaction_id = 'txn_1'")->fetchColumn();
            assertSame('refunded', $status, 'status must remain refunded -- the stale event must not have overwritten it');
        },

        'updateStatus() on an unknown transaction id returns false without throwing' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            assertFalse($repo->updateStatus('txn_never_existed', 'refunded', new \DateTimeImmutable()), 'an unknown transaction id should return false, not throw');
        },

        'findByTransactionId() returns the grant row for a known transaction' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $occurredAt = new \DateTimeImmutable('2026-01-01 00:00:00');
            $repo->create('txn_1', 'user-1', 'full_tamamizu', 1, $occurredAt);

            $grant = $repo->findByTransactionId('txn_1');
            assertTrue($grant !== null, 'a known transaction id should resolve');
            assertSame('user-1', $grant['user_id'], 'user_id should match');
            assertSame('active', $grant['status'], 'status should be active on creation');
        },

        'findByTransactionId() returns null for an unknown transaction' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            assertSame(null, $repo->findByTransactionId('txn_unknown'), 'unknown transaction id should return null');
        },

        // -- Required scenario from the design spec: an old transaction
        // refund must never revoke a newer valid purchase.
        'repurchase scenario: transaction A active, transaction B later active, refund A -- B remains entitled' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $repo->create('txn_A', 'user-1', 'full_tamamizu', 1, new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->create('txn_B', 'user-1', 'full_tamamizu', 2, new \DateTimeImmutable('2026-01-05 00:00:00'));

            assertTrue($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'user should be entitled with both A and B active');

            $repo->updateStatus('txn_A', 'refunded', new \DateTimeImmutable('2026-01-10 00:00:00'));

            assertTrue($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'user must remain entitled -- B is still active even though A was refunded');

            $grantB = $repo->findByTransactionId('txn_B');
            assertSame('active', $grantB['status'], 'B must be untouched by A\'s refund');
        },

        'refund for one user cannot affect another user\'s entitlement' => function () {
            $repo = new TransactionGrantRepository(makeTransactionGrantsTestDb());
            $repo->create('txn_user1', 'user-1', 'full_tamamizu', 1, new \DateTimeImmutable('2026-01-01 00:00:00'));
            $repo->create('txn_user2', 'user-2', 'full_tamamizu', 2, new \DateTimeImmutable('2026-01-01 00:00:00'));

            $repo->updateStatus('txn_user1', 'refunded', new \DateTimeImmutable('2026-01-02 00:00:00'));

            assertFalse($repo->hasEntitlementBearingGrant('user-1', 'full_tamamizu'), 'user-1 should be revoked');
            assertTrue($repo->hasEntitlementBearingGrant('user-2', 'full_tamamizu'), 'user-2 must be unaffected by user-1\'s refund');
        },
    ];
}
