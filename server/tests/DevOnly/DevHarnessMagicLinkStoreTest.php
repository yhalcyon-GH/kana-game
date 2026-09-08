<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\DevOnly\DevHarnessMagicLinkStore;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/DevOnly/DevHarnessMagicLinkStore.php';

function makeDevHarnessStoreTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE dev_harness_magic_links (
            email_normalized TEXT PRIMARY KEY,
            magic_link_url TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function devHarnessMagicLinkStoreTests(): array
{
    return [
        'store() then consume() returns the stored URL exactly once' => function () {
            $store = new DevHarnessMagicLinkStore(makeDevHarnessStoreTestDb());
            $store->store('user@example.com', 'https://example.com/#/verify?token=raw-token', new \DateTimeImmutable('+15 minutes'));

            $url = $store->consume('user@example.com');
            assertSame('https://example.com/#/verify?token=raw-token', $url, 'the stored URL should be returned');
        },

        'consume() deletes the row -- a second consume() for the same email returns null' => function () {
            $store = new DevHarnessMagicLinkStore(makeDevHarnessStoreTestDb());
            $store->store('user@example.com', 'https://example.com/#/verify?token=raw', new \DateTimeImmutable('+15 minutes'));

            $store->consume('user@example.com');
            $second = $store->consume('user@example.com');
            assertSame(null, $second, 'a second consume for the same email must return null -- the row was deleted');
        },

        'store() for the same email twice replaces the previous link (latest wins)' => function () {
            $store = new DevHarnessMagicLinkStore(makeDevHarnessStoreTestDb());
            $store->store('user@example.com', 'https://example.com/#/verify?token=first', new \DateTimeImmutable('+15 minutes'));
            $store->store('user@example.com', 'https://example.com/#/verify?token=second', new \DateTimeImmutable('+15 minutes'));

            $url = $store->consume('user@example.com');
            assertSame('https://example.com/#/verify?token=second', $url, 'only the latest stored link should be retrievable');
        },

        'consume() with an unknown email returns null' => function () {
            $store = new DevHarnessMagicLinkStore(makeDevHarnessStoreTestDb());
            assertSame(null, $store->consume('never-stored@example.com'), 'an unknown email should return null');
        },

        'consume() with an expired row returns null (and does not resurrect it)' => function () {
            $pdo = makeDevHarnessStoreTestDb();
            $store = new DevHarnessMagicLinkStore($pdo);
            $store->store('expired@example.com', 'https://example.com/#/verify?token=expired', new \DateTimeImmutable('-1 minute'));

            $url = $store->consume('expired@example.com');
            assertSame(null, $url, 'an expired row must not be returned');
        },

        'consume() requires an EXACT normalized-email match -- a different email cannot retrieve another email\'s link' => function () {
            $store = new DevHarnessMagicLinkStore(makeDevHarnessStoreTestDb());
            $store->store('victim@example.com', 'https://example.com/#/verify?token=victim-token', new \DateTimeImmutable('+15 minutes'));

            assertSame(null, $store->consume('attacker@example.com'), 'a different email must not retrieve another email\'s stored link');
        },
    ];
}
