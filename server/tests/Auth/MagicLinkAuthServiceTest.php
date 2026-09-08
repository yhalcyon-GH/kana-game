<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\FakeMailer;
use KanaGame\Paddle\Auth\MagicLinkAuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\MagicLinkUrlBuilder;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/EmailNormalizer.php';
require_once __DIR__ . '/../../src/Auth/EmailValidator.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkAuthService.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkTokenRepository.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkUrlBuilder.php';
require_once __DIR__ . '/../../src/Auth/RateLimiter.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/FakeMailer.php';
require_once __DIR__ . '/../../src/Uuid.php';

function makeMagicLinkAuthServiceTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email_normalized TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE magic_link_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_normalized TEXT NOT NULL,
            user_id TEXT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE rate_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bucket TEXT NOT NULL,
            identifier TEXT NOT NULL,
            window_start TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            UNIQUE (bucket, identifier)
        )',
    );
    return $pdo;
}

/**
 * @return array{service: MagicLinkAuthService, mailer: FakeMailer, pdo: PDO}
 */
function makeMagicLinkAuthServiceHarness(?PDO $pdo = null, int $emailLimit = 5, int $ipLimit = 20): array
{
    $pdo ??= makeMagicLinkAuthServiceTestDb();
    $mailer = new FakeMailer();
    $currentUser = new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24);
    $service = new MagicLinkAuthService(
        $pdo,
        new MagicLinkTokenRepository($pdo),
        new UserRepository($pdo),
        new RateLimiter($pdo, 'test-pepper', $emailLimit, $ipLimit),
        $mailer,
        new MagicLinkUrlBuilder('https://example.com/kana-game/'),
        $currentUser,
        15,
    );

    return ['service' => $service, 'mailer' => $mailer, 'pdo' => $pdo];
}

function extractTokenFromUrl(string $url): string
{
    $fragment = parse_url($url, PHP_URL_FRAGMENT);
    parse_str(substr((string) $fragment, strpos((string) $fragment, '?') + 1), $params);
    return $params['token'];
}

/**
 * @return array<string, callable(): void>
 */
function magicLinkAuthServiceTests(): array
{
    return [
        'requestLink() sends a magic link email for a valid request' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('User@Example.com', '203.0.113.1');

            assertSame(1, count($h['mailer']->sent), 'exactly one email should have been sent');
            assertSame('user@example.com', $h['mailer']->sent[0]['email'], 'the recorded email should be normalized');
        },

        'requestLink() does not create a users row' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('nouser@example.com', '203.0.113.1');

            $count = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(0, $count, 'request-link must never create a durable user row');
        },

        'requestLink() with a malformed email sends no mail but STILL records against the IP bucket' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('not-an-email', '203.0.113.50');

            assertSame(0, count($h['mailer']->sent), 'a malformed email must never trigger a mailer call');

            $row = $h['pdo']->query("SELECT count FROM rate_limits WHERE bucket = 'magic_link_ip'")->fetch();
            assertTrue($row !== false, 'the IP bucket must have recorded this attempt even though the email was malformed');
            assertSame(1, (int) $row['count'], 'the IP bucket count should be 1 after one malformed-email attempt');
        },

        'requestLink() silently drops the email send when the per-email rate limit is exceeded' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            for ($i = 0; $i < 5; $i++) {
                $h['service']->requestLink('spammed@example.com', "203.0.113.{$i}");
            }
            $h['service']->requestLink('spammed@example.com', '203.0.113.99');

            assertSame(5, count($h['mailer']->sent), 'the 6th request in the window must not trigger a mailer call');
        },

        'requestLink() silently drops the email send when the per-IP rate limit is exceeded, even for a brand-new email' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            for ($i = 0; $i < 20; $i++) {
                $h['service']->requestLink("victim{$i}@example.com", '203.0.113.9');
            }
            $h['service']->requestLink('final-victim@example.com', '203.0.113.9');

            assertSame(20, count($h['mailer']->sent), 'the 21st request from this one IP must not trigger a mailer call, even for a never-before-seen email');
        },

        'verify() with a freshly issued token succeeds and creates a session' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('verify-me@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $result = $h['service']->verify($rawToken);

            assertTrue($result->success, 'verification should succeed');
            assertTrue($result->sessionToken !== null, 'a session token should be returned');
            assertSame('verify-me@example.com', $result->user['email_normalized'], 'resolved user should match');
        },

        'verify() creates exactly one user on first-ever verification' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('firsttime@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $h['service']->verify($rawToken);

            $count = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(1, $count, 'exactly one user row should exist after first verification');
        },

        'verify() binds the consumed token to the resolved user (referential integrity)' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('bind-check@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $result = $h['service']->verify($rawToken);

            $boundUserId = $h['pdo']->query(
                "SELECT user_id FROM magic_link_tokens WHERE email_normalized = 'bind-check@example.com'",
            )->fetchColumn();
            assertSame($result->user['id'], $boundUserId, 'the consumed token row must be bound to the resolved user');
        },

        'verify() with the same token twice succeeds once and fails the second time (single-use)' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('reuse@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $first = $h['service']->verify($rawToken);
            $second = $h['service']->verify($rawToken);

            assertTrue($first->success, 'first verify should succeed');
            assertFalse($second->success, 'second verify of the same token must fail');
        },

        'verify() with an unknown token fails with the same generic result shape as an expired/used token' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $result = $h['service']->verify('never-issued-token');

            assertFalse($result->success, 'unknown token must fail');
            assertSame(null, $result->sessionToken, 'no session token should be returned on failure');
        },

        // -- Race-scenario tests (NOT true concurrent MariaDB execution
        // -- see the PR A plan's Global Constraints). These run
        // sequentially against one SQLite connection and prove the
        // ATOMICITY/IDEMPOTENCY of the SQL patterns used, not real
        // simultaneous multi-connection behavior.

        'race-scenario test: two concurrent verify() calls for the SAME token -- exactly one succeeds' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('race-same-token@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $first = $h['service']->verify($rawToken);
            $second = $h['service']->verify($rawToken);

            $successCount = ($first->success ? 1 : 0) + ($second->success ? 1 : 0);
            assertSame(1, $successCount, 'exactly one of the two concurrent verifications must succeed');
        },

        'race-scenario test: two DISTINCT valid tokens for the SAME email -- both succeed, resolve to one user, no duplicate-key error' => function () {
            $h = makeMagicLinkAuthServiceHarness();

            $h['service']->requestLink('two-links@example.com', '203.0.113.1');
            $h['service']->requestLink('two-links@example.com', '203.0.113.2');
            $rawTokenA = extractTokenFromUrl($h['mailer']->sent[0]['url']);
            $rawTokenB = extractTokenFromUrl($h['mailer']->sent[1]['url']);

            $resultA = $h['service']->verify($rawTokenA);
            $resultB = $h['service']->verify($rawTokenB);

            assertTrue($resultA->success, 'verifying link A must succeed');
            assertTrue($resultB->success, 'verifying link B must succeed');
            assertSame(
                $resultA->user['id'],
                $resultB->user['id'],
                'both links for the same email must resolve to the same user id',
            );

            $userCount = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(1, $userCount, 'exactly one user row must exist -- no duplicate-key error, no duplicate user');
        },
    ];
}
