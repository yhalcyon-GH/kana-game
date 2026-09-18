<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\DevOnly\DevHarnessLoginCodeStore;
use KanaGame\Paddle\DevOnly\DevHarnessMagicLinkStore;
use KanaGame\Paddle\DevOnly\DevHarnessMailer;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/DevOnly/DevHarnessLoginCodeStore.php';
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
function devHarnessMailerTests(): array
{
    return [
        'sendMagicLink() with the harness enabled stores the link, retrievable via the store' => function () {
            $pdo = makeDevHarnessMailerTestDb();
            $magicLinkStore = new DevHarnessMagicLinkStore($pdo);
            $loginCodeStore = new DevHarnessLoginCodeStore($pdo);
            $mailer = new DevHarnessMailer($magicLinkStore, $loginCodeStore, true, 15);

            $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=raw');

            assertSame('https://example.com/#/verify?token=raw', $magicLinkStore->consume('user@example.com'), 'the link should be retrievable after sendMagicLink()');
        },

        'sendMagicLink() with the harness DISABLED does not write anything' => function () {
            $pdo = makeDevHarnessMailerTestDb();
            $magicLinkStore = new DevHarnessMagicLinkStore($pdo);
            $loginCodeStore = new DevHarnessLoginCodeStore($pdo);
            $mailer = new DevHarnessMailer($magicLinkStore, $loginCodeStore, false, 15);

            $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=raw');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM dev_harness_magic_links')->fetchColumn();
            assertSame(0, $count, 'no row should be written when the harness flag is false, even though sendMagicLink() was called');
        },

        'sendLoginCode() with the harness enabled stores the code, retrievable via the store' => function () {
            $pdo = makeDevHarnessMailerTestDb();
            $magicLinkStore = new DevHarnessMagicLinkStore($pdo);
            $loginCodeStore = new DevHarnessLoginCodeStore($pdo);
            $mailer = new DevHarnessMailer($magicLinkStore, $loginCodeStore, true, 15);

            $mailer->sendLoginCode('user@example.com', '123456');

            assertSame('123456', $loginCodeStore->consume('user@example.com'), 'the code should be retrievable after sendLoginCode()');
        },

        'sendLoginCode() with the harness DISABLED does not write anything' => function () {
            $pdo = makeDevHarnessMailerTestDb();
            $magicLinkStore = new DevHarnessMagicLinkStore($pdo);
            $loginCodeStore = new DevHarnessLoginCodeStore($pdo);
            $mailer = new DevHarnessMailer($magicLinkStore, $loginCodeStore, false, 15);

            $mailer->sendLoginCode('user@example.com', '123456');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM dev_harness_login_codes')->fetchColumn();
            assertSame(0, $count, 'no row should be written when the harness flag is false, even though sendLoginCode() was called');
        },
    ];
}
