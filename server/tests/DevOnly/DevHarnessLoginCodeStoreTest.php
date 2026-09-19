<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\DevOnly\DevHarnessLoginCodeStore;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/DevOnly/DevHarnessLoginCodeStore.php';

function makeDevHarnessLoginCodeStoreTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE dev_harness_login_codes (
            email_normalized TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function devHarnessLoginCodeStoreTests(): array
{
    return [
        'store() then consume() returns the stored code exactly once' => function () {
            $store = new DevHarnessLoginCodeStore(makeDevHarnessLoginCodeStoreTestDb());
            $store->store('user@example.com', '123456', new \DateTimeImmutable('+15 minutes'));

            $code = $store->consume('user@example.com');
            assertSame('123456', $code, 'the stored code should be returned');
        },

        'consume() deletes the row -- a second consume() for the same email returns null' => function () {
            $store = new DevHarnessLoginCodeStore(makeDevHarnessLoginCodeStoreTestDb());
            $store->store('user@example.com', '123456', new \DateTimeImmutable('+15 minutes'));

            $store->consume('user@example.com');
            $second = $store->consume('user@example.com');
            assertSame(null, $second, 'a second consume for the same email must return null -- the row was deleted');
        },

        'store() for the same email twice replaces the previous code (latest wins)' => function () {
            $store = new DevHarnessLoginCodeStore(makeDevHarnessLoginCodeStoreTestDb());
            $store->store('user@example.com', '111111', new \DateTimeImmutable('+15 minutes'));
            $store->store('user@example.com', '222222', new \DateTimeImmutable('+15 minutes'));

            $code = $store->consume('user@example.com');
            assertSame('222222', $code, 'only the latest stored code should be retrievable');
        },

        'consume() with an unknown email returns null' => function () {
            $store = new DevHarnessLoginCodeStore(makeDevHarnessLoginCodeStoreTestDb());
            assertSame(null, $store->consume('never-stored@example.com'), 'an unknown email should return null');
        },

        'consume() with an expired row returns null (and does not resurrect it)' => function () {
            $pdo = makeDevHarnessLoginCodeStoreTestDb();
            $store = new DevHarnessLoginCodeStore($pdo);
            $store->store('expired@example.com', '999999', new \DateTimeImmutable('-1 minute'));

            $code = $store->consume('expired@example.com');
            assertSame(null, $code, 'an expired row must not be returned');
        },

        'consume() requires an EXACT normalized-email match -- a different email cannot retrieve another email\'s code' => function () {
            $store = new DevHarnessLoginCodeStore(makeDevHarnessLoginCodeStoreTestDb());
            $store->store('victim@example.com', '654321', new \DateTimeImmutable('+15 minutes'));

            assertSame(null, $store->consume('attacker@example.com'), 'a different email must not retrieve another email\'s stored code');
        },
    ];
}
