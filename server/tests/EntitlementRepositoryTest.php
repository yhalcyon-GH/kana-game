<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\EntitlementRepository;
use PDO;

require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/../src/EntitlementRepository.php';

/**
 * Uses an in-memory SQLite DB (via PDO) rather than a real MySQL server —
 * EntitlementRepository's SQL is written to be portable (see its own
 * "portable SELECT-then-INSERT/UPDATE" comment) specifically so these
 * tests can run without any external DB dependency.
 */
function makeEntitlementsTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE entitlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            internal_user_id TEXT NOT NULL,
            product_key TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 0,
            paddle_transaction_id TEXT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (internal_user_id, product_key)
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function entitlementRepositoryTests(): array
{
    return [
        'find() returns null when no entitlement row exists' => function () {
            $repo = new EntitlementRepository(makeEntitlementsTestDb());
            assertSame(null, $repo->find('sandbox-test-user', 'full_tamamizu'), 'no row should mean null');
        },

        'activate() creates a new active entitlement' => function () {
            $repo = new EntitlementRepository(makeEntitlementsTestDb());
            $repo->activate('sandbox-test-user', 'full_tamamizu', 'txn_1');

            $found = $repo->find('sandbox-test-user', 'full_tamamizu');
            assertTrue($found !== null, 'entitlement should now exist');
            assertSame('full_tamamizu', $found['product_key'], 'product_key should match');
            assertTrue($found['active'], 'active should be true');
        },

        'activate() called twice for the same user/product does not duplicate the row (idempotent re-purchase/retry)' => function () {
            $pdo = makeEntitlementsTestDb();
            $repo = new EntitlementRepository($pdo);
            $repo->activate('sandbox-test-user', 'full_tamamizu', 'txn_1');
            $repo->activate('sandbox-test-user', 'full_tamamizu', 'txn_2');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM entitlements')->fetchColumn();
            assertSame(1, $count, 'exactly one row should exist after two activations of the same user/product');

            $found = $repo->find('sandbox-test-user', 'full_tamamizu');
            assertTrue($found['active'], 'should still be active after the second activation');
        },

        'revoke() flips an active entitlement to inactive (refund)' => function () {
            $repo = new EntitlementRepository(makeEntitlementsTestDb());
            $repo->activate('sandbox-test-user', 'full_tamamizu', 'txn_1');
            $repo->revoke('sandbox-test-user', 'full_tamamizu', 'txn_1');

            $found = $repo->find('sandbox-test-user', 'full_tamamizu');
            assertFalse($found['active'], 'active should be false after revoke');
        },

        'revoke() on a user/product with no prior entitlement creates an inactive row rather than throwing' => function () {
            $repo = new EntitlementRepository(makeEntitlementsTestDb());
            $repo->revoke('sandbox-test-user', 'full_tamamizu', 'txn_refund_only');

            $found = $repo->find('sandbox-test-user', 'full_tamamizu');
            assertTrue($found !== null, 'a row should exist');
            assertFalse($found['active'], 'should be inactive');
        },

        'entitlements for different products under the same user are independent' => function () {
            $repo = new EntitlementRepository(makeEntitlementsTestDb());
            $repo->activate('sandbox-test-user', 'full_tamamizu', 'txn_1');

            assertSame(null, $repo->find('sandbox-test-user', 'some_other_product'), 'a different product must not be affected');
        },
    ];
}
