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
 * @return array<string, callable(): void>
 */
function rateLimiterTests(): array
{
    return [
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
