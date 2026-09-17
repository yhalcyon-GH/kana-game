<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\EmailLoginChallengeRepository;
use KanaGame\Paddle\Auth\FakeMailer;
use KanaGame\Paddle\Auth\OtpAuthService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/EmailNormalizer.php';
require_once __DIR__ . '/../../src/Auth/EmailValidator.php';
require_once __DIR__ . '/../../src/Auth/EmailLoginChallengeRepository.php';
require_once __DIR__ . '/../../src/Auth/OtpAuthService.php';
require_once __DIR__ . '/../../src/Auth/PersistentSessionRepository.php';
require_once __DIR__ . '/../../src/Auth/RateLimiter.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/FakeMailer.php';
require_once __DIR__ . '/../../src/Uuid.php';

const OTP_TEST_PEPPER = 'test-login-code-pepper';

function makeOtpAuthServiceTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE users (id TEXT PRIMARY KEY, email_normalized TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE email_login_challenges (id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_token_hash TEXT NOT NULL UNIQUE, email_normalized TEXT NOT NULL, code_mac TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used_at TEXT NULL, invalidated_at TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE persistent_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, persistent_session_id INTEGER NULL, expires_at TEXT NOT NULL, revoked_at TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE rate_limits (id INTEGER PRIMARY KEY AUTOINCREMENT, bucket TEXT NOT NULL, identifier TEXT NOT NULL, window_start TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, UNIQUE (bucket, identifier))');
    return $pdo;
}

/**
 * @return array{service: OtpAuthService, mailer: FakeMailer, pdo: PDO, challenges: EmailLoginChallengeRepository, persistentSessions: PersistentSessionRepository}
 */
function makeOtpAuthServiceHarness(?PDO $pdo = null, int $emailLimit = 3, int $ipLimit = 10, int $maxAttempts = 5, int $maxPersistentSessions = 3): array
{
    $pdo ??= makeOtpAuthServiceTestDb();
    $mailer = new FakeMailer();
    $challenges = new EmailLoginChallengeRepository($pdo);
    $persistentSessions = new PersistentSessionRepository($pdo);
    $currentUser = new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24, $persistentSessions);
    $service = new OtpAuthService(
        $pdo,
        $challenges,
        $persistentSessions,
        new UserRepository($pdo),
        new SessionRepository($pdo),
        new RateLimiter($pdo, 'test-rate-limit-pepper', 5, 20, $emailLimit, $ipLimit),
        $mailer,
        $currentUser,
        OTP_TEST_PEPPER,
        10,
        $maxAttempts,
        90,
        $maxPersistentSessions,
    );

    return ['service' => $service, 'mailer' => $mailer, 'pdo' => $pdo, 'challenges' => $challenges, 'persistentSessions' => $persistentSessions];
}

/**
 * @return array<string, callable(): void>
 */
function otpAuthServiceTests(): array
{
    return [
        'requestCode() sends a 6-digit code email and returns a challenge token for a valid email' => function () {
            $h = makeOtpAuthServiceHarness();
            $result = $h['service']->requestCode('User@Example.com', '203.0.113.1');

            assertTrue($result->challengeToken !== null, 'a valid request should return a challenge token');
            assertSame(1, count($h['mailer']->sentCodes), 'exactly one code email should have been sent');
            assertSame('user@example.com', $h['mailer']->sentCodes[0]['email'], 'the recorded email should be normalized');
            assertSame(6, strlen($h['mailer']->sentCodes[0]['code']), 'the code must always be exactly 6 digits, preserving leading zeros');
            assertTrue(ctype_digit($h['mailer']->sentCodes[0]['code']), 'the code must be all digits');
        },

        'requestCode() does not create a users row' => function () {
            $h = makeOtpAuthServiceHarness();
            $h['service']->requestCode('nouser@example.com', '203.0.113.1');

            $count = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(0, $count, 'request-code must never create a durable user row -- find-or-create happens only on verify');
        },

        'requestCode() with a malformed email returns no challenge but still records against the IP bucket' => function () {
            $h = makeOtpAuthServiceHarness();
            $result = $h['service']->requestCode('not-an-email', '203.0.113.50');

            assertTrue($result->challengeToken === null, 'a malformed email must never produce a challenge');
            assertSame(0, count($h['mailer']->sentCodes), 'no email should be sent for a malformed email');

            $row = $h['pdo']->query("SELECT count FROM rate_limits WHERE bucket = 'login_code_ip'")->fetch();
            assertTrue($row !== false, 'the login-code IP bucket must have recorded this attempt even though the email was malformed');
        },

        'requestCode() returns no challenge once the per-email login-code limit is exceeded' => function () {
            $h = makeOtpAuthServiceHarness(null, 3, 10);
            for ($i = 0; $i < 3; $i++) {
                $r = $h['service']->requestCode('spammed@example.com', "203.0.113.{$i}");
                assertTrue($r->challengeToken !== null, "attempt {$i} should still succeed");
            }
            $blocked = $h['service']->requestCode('spammed@example.com', '203.0.113.99');
            assertTrue($blocked->challengeToken === null, 'the 4th request must be blocked by the login-code email bucket');
        },

        'requestCode() invalidates the prior open challenge for the same email (resend invalidation)' => function () {
            $h = makeOtpAuthServiceHarness();
            $first = $h['service']->requestCode('resend@example.com', '203.0.113.1');
            $second = $h['service']->requestCode('resend@example.com', '203.0.113.2');

            $oldConsume = $h['challenges']->consumeAttempt($first->challengeToken, $h['mailer']->sentCodes[0]['code'], OTP_TEST_PEPPER, 5);
            $newConsume = $h['challenges']->consumeAttempt($second->challengeToken, $h['mailer']->sentCodes[1]['code'], OTP_TEST_PEPPER, 5);

            assertFalse($oldConsume->success, 'the superseded first challenge must never succeed after a resend');
            assertTrue($newConsume->success, 'the fresh challenge issued by the resend must succeed');
        },

        'verifyCode() with the correct code succeeds, creates a user, and issues both a session and a persistent token' => function () {
            $h = makeOtpAuthServiceHarness();
            $request = $h['service']->requestCode('verify-me@example.com', '203.0.113.1');
            $code = $h['mailer']->sentCodes[0]['code'];

            $result = $h['service']->verifyCode($request->challengeToken, $code);

            assertTrue($result->success, 'verifyCode() with the correct code must succeed');
            assertTrue($result->sessionToken !== null, 'a successful verify must return a session token');
            assertTrue($result->persistentToken !== null, 'a successful verify must return a persistent token');
            assertSame('verify-me@example.com', $result->user['email_normalized'], 'the returned user must carry the normalized email');

            $userCount = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(1, $userCount, 'exactly one user row should exist after first verification');
            assertSame(1, $h['persistentSessions']->countActiveForUser($result->user['id']), 'exactly one persistent session should have been created');
        },

        'verifyCode() with the wrong code fails and creates no user, no session, no persistent session' => function () {
            $h = makeOtpAuthServiceHarness();
            $request = $h['service']->requestCode('wrong-code@example.com', '203.0.113.1');

            $result = $h['service']->verifyCode($request->challengeToken, '000000');

            assertFalse($result->success, 'verifyCode() with the wrong code must fail');
            assertTrue($result->sessionToken === null, 'a failed verify must not return a session token');
            assertSame(0, (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn(), 'a wrong-code verify must not create a user');
        },

        'verifyCode() with an unknown challenge token fails with the same generic shape' => function () {
            $h = makeOtpAuthServiceHarness();
            $result = $h['service']->verifyCode('never-issued-challenge', '123456');

            assertFalse($result->success, 'an unknown challenge token must fail');
            assertTrue($result->sessionToken === null, 'a failed verify must not return a session token');
            assertTrue($result->user === null, 'a failed verify must not return a user');
        },

        'verifyCode() twice with the same challenge succeeds once and fails the second time (single-use)' => function () {
            $h = makeOtpAuthServiceHarness();
            $request = $h['service']->requestCode('reuse-otp@example.com', '203.0.113.1');
            $code = $h['mailer']->sentCodes[0]['code'];

            $first = $h['service']->verifyCode($request->challengeToken, $code);
            $second = $h['service']->verifyCode($request->challengeToken, $code);

            assertTrue($first->success, 'the first verifyCode() call with the correct code must succeed');
            assertFalse($second->success, 'a second verifyCode() call against the same (already-used) challenge must fail');
        },

        'verifyCode() creates a NEW persistent session on every successful login (never reuses one)' => function () {
            $h = makeOtpAuthServiceHarness();
            $requestA = $h['service']->requestCode('repeat-login@example.com', '203.0.113.1');
            $resultA = $h['service']->verifyCode($requestA->challengeToken, $h['mailer']->sentCodes[0]['code']);
            $requestB = $h['service']->requestCode('repeat-login@example.com', '203.0.113.2');
            $resultB = $h['service']->verifyCode($requestB->challengeToken, $h['mailer']->sentCodes[1]['code']);

            assertTrue($resultA->persistentToken !== $resultB->persistentToken, 'each login must mint a fresh persistent token, not reuse one');
            assertSame(2, $h['persistentSessions']->countActiveForUser($resultA->user['id']), 'both logins must have their own active persistent session');
        },

        'a 4th successful login evicts the least-recently-used persistent session and cascade-revokes its linked session, without blocking the 4th login' => function () {
            // emailLimit raised to 10 (default OTP request-code flow uses
            // 3/hour) purely so this test's 4 requestCode() calls for the
            // same email don't collide with the UNRELATED per-email OTP
            // request-rate limit under test elsewhere -- this test is
            // about persistent-session quota/LRU eviction, not the
            // request-code rate limiter, and maxPersistentSessions stays
            // at 3 (the actual thing under test).
            $h = makeOtpAuthServiceHarness(null, 10, 10, 5, 3);
            $email = 'quota@example.com';
            $sessionTokens = [];
            $persistentTokensSeen = [];

            for ($i = 0; $i < 3; $i++) {
                $request = $h['service']->requestCode($email, "203.0.113.{$i}");
                $result = $h['service']->verifyCode($request->challengeToken, $h['mailer']->sentCodes[$i]['code']);
                assertTrue($result->success, "login {$i} of 3 (under quota) must succeed normally");
                $sessionTokens[] = $result->sessionToken;
            }
            $userId = $h['pdo']->query("SELECT id FROM users WHERE email_normalized = '{$email}'")->fetchColumn();
            assertSame(3, $h['persistentSessions']->countActiveForUser($userId), 'exactly 3 active persistent sessions before the 4th login');

            $oldestSessionToken = $sessionTokens[0];

            $fourthRequest = $h['service']->requestCode($email, '203.0.113.9');
            $fourthResult = $h['service']->verifyCode($fourthRequest->challengeToken, $h['mailer']->sentCodes[3]['code']);

            assertTrue($fourthResult->success, 'the 4th login must NEVER be blocked -- it proceeds and evicts instead');
            assertSame(3, $h['persistentSessions']->countActiveForUser($userId), 'the count must stay capped at 3 (one evicted, one created)');

            $sessions = new SessionRepository($h['pdo']);
            assertTrue($sessions->findActiveUserIdForRawToken($oldestSessionToken) === null, 'the sessions row linked to the evicted (oldest) persistent session must be cascade-revoked');
        },
    ];
}
