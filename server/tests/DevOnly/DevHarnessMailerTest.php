<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\DevOnly\DevHarnessMagicLinkStore;
use KanaGame\Paddle\DevOnly\DevHarnessMailer;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/DevOnly/DevHarnessMagicLinkStore.php';
require_once __DIR__ . '/../../src/DevOnly/DevHarnessMailer.php';

function makeDevHarnessMailerTestDb(): PDO
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
function devHarnessMailerTests(): array
{
    return [
        'sendMagicLink() with the harness enabled stores the link, retrievable via the store' => function () {
            $pdo = makeDevHarnessMailerTestDb();
            $store = new DevHarnessMagicLinkStore($pdo);
            $mailer = new DevHarnessMailer($store, true, 15);

            $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=raw');

            assertSame('https://example.com/#/verify?token=raw', $store->consume('user@example.com'), 'the link should be retrievable after sendMagicLink()');
        },

        'sendMagicLink() with the harness DISABLED does not write anything' => function () {
            $pdo = makeDevHarnessMailerTestDb();
            $store = new DevHarnessMagicLinkStore($pdo);
            $mailer = new DevHarnessMailer($store, false, 15);

            $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=raw');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM dev_harness_magic_links')->fetchColumn();
            assertSame(0, $count, 'no row should be written when the harness flag is false, even though sendMagicLink() was called');
        },
    ];
}
