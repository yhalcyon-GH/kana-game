<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\RateLimiter;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/RateLimiter.php';

function makeRateLimitTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
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
 * Extracts the SQL string literal(s) passed to $this->pdo->prepare(...)
 * inside RateLimiter::upsertWindowMariaDb() from the source file itself,
 * without executing it. This is a static, DB-driver-independent guard
 * against the exact bug class fixed alongside this test: PDO native
 * prepared statements (PDO::ATTR_EMULATE_PREPARES = false — see
 * server/src/Db.php) do not allow the same named placeholder to be bound
 * to more than one occurrence in a single statement, but SQLite (which
 * every other test in this file runs against) has no such restriction —
 * a duplicate named placeholder in this method's MariaDB-only SQL is
 * invisible to every SQLite-backed test, and was invisible to CI until
 * this check was added. See docs/paddle-auth-phase3a-pr-a.md and the
 * PR A plan's Task 16 for the still-outstanding real-MariaDB concurrency
 * verification this class needs before Live rollout — this test only
 * guards the specific duplicate-placeholder class of bug, not general
 * MariaDB behavior.
 */
function assertNoDuplicateNamedPlaceholdersInMariaDbUpsert(): void
{
    $source = file_get_contents(__DIR__ . '/../../src/Auth/RateLimiter.php');
    assertTrue($source !== false, 'could not read RateLimiter.php source');

    if (!preg_match('/private function upsertWindowMariaDb\([^)]*\)[^{]*\{(.*?)\n    \}/s', $source, $methodMatch)) {
        throw new TestFailure('could not locate upsertWindowMariaDb() body in RateLimiter.php');
    }
    $methodBody = $methodMatch[1];

    if (!preg_match("/->prepare\\(\\s*'(.*?)',\\s*\\);/s", $methodBody, $sqlMatch)) {
        throw new TestFailure('could not locate the prepare() SQL string inside upsertWindowMariaDb()');
    }
    $sql = $sqlMatch[1];

    preg_match_all('/:([a-zA-Z_][a-zA-Z0-9_]*)/', $sql, $placeholderMatches);
    $placeholders = $placeholderMatches[1];
    $counts = array_count_values($placeholders);

    foreach ($counts as $name => $count) {
        assertTrue(
            $count === 1,
            "named placeholder :{$name} appears {$count} times in upsertWindowMariaDb()'s SQL — " .
            'PDO native prepared statements (PDO::ATTR_EMULATE_PREPARES = false) do not support ' .
            'reusing one named placeholder for multiple positions in the same statement and will ' .
            'throw a PDOException at execute() time on real MySQL/MariaDB; give each occurrence its own name instead',
        );
    }
}

/**
 * Exercises RateLimiter::checkAndRecordIp() -> upsertWindowMariaDb()
 * against a REAL MySQL/MariaDB connection with native prepared
 * statements (PDO::ATTR_EMULATE_PREPARES = false, matching
 * server/src/Db.php exactly) — the one thing the SQLite-backed tests
 * above cannot exercise, since SQLite's PDO driver has no equivalent
 * restriction on reusing a named placeholder.
 *
 * Skips itself (does not fail) unless a reachable MariaDB/MySQL
 * instance is configured via the KANA_TEST_MYSQL_DSN env var (e.g.
 * "mysql:host=127.0.0.1;dbname=kana_test"), plus
 * KANA_TEST_MYSQL_USER / KANA_TEST_MYSQL_PASS. No such instance is
 * assumed to exist in CI or on a developer machine by default — this is
 * intentionally opt-in, matching the PR A plan's Task 16 note that real
 * MariaDB verification for this class remains a manual/CI-optional step
 * before Live rollout. Run locally against a real MariaDB by setting
 * those three env vars and re-running server/tests/run-tests.php.
 */
function rateLimiterMariaDbLiveTest(): void
{
    $dsn = getenv('KANA_TEST_MYSQL_DSN');
    if ($dsn === false || $dsn === '') {
        return; // opt-in only -- see doc comment above
    }

    $pdo = new PDO($dsn, getenv('KANA_TEST_MYSQL_USER') ?: null, getenv('KANA_TEST_MYSQL_PASS') ?: null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec('DROP TABLE IF EXISTS rate_limits');
    $pdo->exec(
        'CREATE TABLE rate_limits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            bucket VARCHAR(64) NOT NULL,
            identifier VARCHAR(128) NOT NULL,
            window_start DATETIME NOT NULL,
            count INT NOT NULL DEFAULT 0,
            UNIQUE KEY uniq_bucket_identifier (bucket, identifier)
        )',
    );

    $limiter = new RateLimiter($pdo, 'test-pepper', 5, 20);

    // First call: INSERT branch of ON DUPLICATE KEY UPDATE -- would not
    // have caught the duplicate-:cutoff bug (only the UPDATE branch's IF
    // expressions reference :cutoff twice).
    assertTrue($limiter->checkAndRecordIp('203.0.113.5'), 'first request should be allowed');

    // Second call for the SAME identifier: forces the ON DUPLICATE KEY
    // UPDATE branch to actually run, which is exactly where the
    // duplicate :cutoff placeholder throws SQLSTATE[HY093] under native
    // prepares. Before the fix, this line reproduces the real XServer
    // PDOException.
    assertTrue($limiter->checkAndRecordIp('203.0.113.5'), 'second request for the same IP should still be allowed and must not throw');

    $pdo->exec('DROP TABLE rate_limits');
}

/**
 * @return array<string, callable(): void>
 */
function rateLimiterTests(): array
{
    return [
        'upsertWindowMariaDb() SQL has no duplicate named placeholders (native-prepare safety)' =>
            'KanaGame\\Paddle\\Tests\\assertNoDuplicateNamedPlaceholdersInMariaDbUpsert',

        'live MariaDB (opt-in): checkAndRecordIp() does not throw on the ON DUPLICATE KEY UPDATE branch' =>
            'KanaGame\\Paddle\\Tests\\rateLimiterMariaDbLiveTest',

        'checkAndRecordEmail() allows requests under the limit' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 5; $i++) {
                assertTrue($limiter->checkAndRecordEmail('user@example.com'), "request {$i} should be allowed");
            }
        },

        'checkAndRecordEmail() blocks the 6th request within the same hour for the same email' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 5; $i++) {
                $limiter->checkAndRecordEmail('user@example.com');
            }
            assertFalse($limiter->checkAndRecordEmail('user@example.com'), '6th request within the window must be blocked');
        },

        'checkAndRecordIp() blocks the 21st request within the same hour for the same IP' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 20; $i++) {
                $limiter->checkAndRecordIp('203.0.113.5');
            }
            assertFalse($limiter->checkAndRecordIp('203.0.113.5'), '21st request within the window must be blocked');
        },

        'one IP cycling through many different emails is still blocked by the IP bucket' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 20; $i++) {
                $allowedEmail = $limiter->checkAndRecordEmail("victim{$i}@example.com");
                $allowedIp = $limiter->checkAndRecordIp('198.51.100.9');
                assertTrue($allowedEmail, "each distinct email is individually under its own limit (attempt {$i})");
                assertTrue($allowedIp, "IP attempt {$i} should still be under the 20/hour IP limit");
            }
            assertFalse($limiter->checkAndRecordIp('198.51.100.9'), 'the 21st request from this one IP must be blocked even though every email differed');
        },

        'one email tried from many different IPs is still blocked by the email bucket' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 5; $i++) {
                $allowedEmail = $limiter->checkAndRecordEmail('target@example.com');
                $allowedIp = $limiter->checkAndRecordIp("192.0.2.{$i}");
                assertTrue($allowedEmail, "email attempt {$i} should still be under the 5/hour email limit");
                assertTrue($allowedIp, "each distinct IP is individually under its own limit (attempt {$i})");
            }
            assertFalse($limiter->checkAndRecordEmail('target@example.com'), 'the 6th request for this one email must be blocked even though every IP differed');
        },

        'the raw email is never persisted -- only its HMAC is stored' => function () {
            $pdo = makeRateLimitTestDb();
            $limiter = new RateLimiter($pdo, 'test-pepper', 5, 20);
            $limiter->checkAndRecordEmail('sensitive@example.com');

            $rows = $pdo->query("SELECT identifier FROM rate_limits WHERE bucket = 'magic_link_email'")->fetchAll();
            assertTrue(count($rows) === 1, 'exactly one rate-limit row should exist');
            foreach ($rows as $row) {
                assertFalse(
                    str_contains($row['identifier'], 'sensitive@example.com'),
                    'the raw email must never appear in the persisted identifier column',
                );
            }
        },

        'the raw IP is never persisted -- only its HMAC is stored' => function () {
            $pdo = makeRateLimitTestDb();
            $limiter = new RateLimiter($pdo, 'test-pepper', 5, 20);
            $limiter->checkAndRecordIp('203.0.113.77');

            $rows = $pdo->query("SELECT identifier FROM rate_limits WHERE bucket = 'magic_link_ip'")->fetchAll();
            assertTrue(count($rows) === 1, 'exactly one rate-limit row should exist');
            foreach ($rows as $row) {
                assertFalse(
                    str_contains($row['identifier'], '203.0.113.77'),
                    'the raw IP must never appear in the persisted identifier column',
                );
            }
        },

        // -- Race-scenario / atomicity semantic test (NOT true concurrent
        // MariaDB execution -- see the PR A plan's Global Constraints).
        // Proves the atomic-upsert-then-locked-read pattern converges on
        // exactly one row per identifier even when the very first call
        // for a brand-new identifier is repeated back-to-back.
        'race-scenario test: repeated first-ever calls for a brand-new identifier never create duplicate rows' => function () {
            $pdo = makeRateLimitTestDb();
            $limiter = new RateLimiter($pdo, 'test-pepper', 5, 20);

            for ($i = 0; $i < 3; $i++) {
                $limiter->checkAndRecordEmail('brand-new@example.com');
            }

            $count = (int) $pdo->query(
                "SELECT COUNT(*) FROM rate_limits WHERE bucket = 'magic_link_email'",
            )->fetchColumn();
            assertSame(1, $count, 'exactly one row must exist for this identifier no matter how many times the first-call path runs');
        },
    ];
}
