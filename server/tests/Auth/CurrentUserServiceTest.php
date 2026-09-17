<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
use KanaGame\Paddle\Auth\SessionCredentialResolver;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/PersistentSessionRepository.php';
require_once __DIR__ . '/../../src/Auth/SessionCredentialResolver.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/../../src/Uuid.php';

function makeCurrentUserServiceTestDb(): PDO
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
        'CREATE TABLE sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT NULL,
            persistent_session_id INTEGER NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE persistent_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

function makeCurrentUserService(PDO $pdo): CurrentUserService
{
    return new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24);
}

/**
 * @return array<string, callable(): void>
 */
function currentUserServiceTests(): array
{
    return [
        'createSession() then resolve() resolves the correct user' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $service = makeCurrentUserService($pdo);
            $user = $users->findOrCreateByEmail('session-test@example.com');

            $rawToken = $service->createSession($user['id']);
            $resolved = $service->resolve($rawToken);

            assertTrue($resolved !== null, 'a freshly created session should resolve');
            assertSame('session-test@example.com', $resolved['email_normalized'], 'email should match');
            assertSame($user['id'], $resolved['user_id'], 'user_id should match');
        },

        'resolve() returns null for an unknown token' => function () {
            $service = makeCurrentUserService(makeCurrentUserServiceTestDb());
            assertSame(null, $service->resolve('never-created'), 'unknown token should return null');
        },

        'logout() revokes the session so a later resolve() call fails' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $service = makeCurrentUserService($pdo);
            $user = $users->findOrCreateByEmail('logout-test@example.com');
            $rawToken = $service->createSession($user['id']);

            $service->logout($rawToken);

            assertSame(null, $service->resolve($rawToken), 'resolve() must fail after logout');
        },

        'createSession() generates a different token on each call' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $service = makeCurrentUserService($pdo);
            $user = $users->findOrCreateByEmail('multi-session@example.com');

            $first = $service->createSession($user['id']);
            $second = $service->createSession($user['id']);

            assertFalse($first === $second, 'two calls should not produce the same raw token');
            assertTrue($service->resolve($first) !== null, 'first session should still resolve');
            assertTrue($service->resolve($second) !== null, 'second session should also resolve');
        },

        'resolveOrRefresh() with a valid session token resolves normally and requests no refresh' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $sessions = new SessionRepository($pdo);
            $persistentSessions = new PersistentSessionRepository($pdo);
            $service = new CurrentUserService($users, $sessions, 24, $persistentSessions);
            $user = $users->findOrCreateByEmail('refresh-valid@example.com');
            $rawSession = $service->createSession($user['id']);

            $result = $service->resolveOrRefresh($rawSession, null);

            assertSame($user['id'], $result['user']['user_id'], 'resolved user_id should match');
            assertTrue($result['refreshed_session_token'] === null, 'a still-valid session must never be silently replaced');
        },

        'resolveOrRefresh() with no session token but a valid persistent token mints a fresh session' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $sessions = new SessionRepository($pdo);
            $persistentSessions = new PersistentSessionRepository($pdo);
            $service = new CurrentUserService($users, $sessions, 24, $persistentSessions);
            $user = $users->findOrCreateByEmail('refresh-persistent@example.com');
            $persistentId = $persistentSessions->create($user['id'], 'raw-remember', new \DateTimeImmutable('+90 days'));

            $result = $service->resolveOrRefresh(null, 'raw-remember');

            assertSame($user['id'], $result['user']['user_id'], 'resolved user_id should match');
            assertTrue($result['refreshed_session_token'] !== null, 'a valid persistent credential with no session must mint a fresh session token');
            assertTrue($service->resolve($result['refreshed_session_token']) !== null, 'the newly minted session token must itself resolve');

            $newSession = $pdo->query("SELECT persistent_session_id FROM sessions WHERE token_hash = '" . hash('sha256', $result['refreshed_session_token']) . "'")->fetch();
            assertSame($persistentId, (int) $newSession['persistent_session_id'], 'the newly minted session must be linked back to the persistent session that authorized it');
        },

        'resolveOrRefresh() with an expired session and no persistent token resolves to no user' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $sessions = new SessionRepository($pdo);
            $persistentSessions = new PersistentSessionRepository($pdo);
            $service = new CurrentUserService($users, $sessions, 24, $persistentSessions);

            $result = $service->resolveOrRefresh('never-issued-session', null);

            assertTrue($result['user'] === null, 'no user should resolve when neither credential is valid');
            assertTrue($result['refreshed_session_token'] === null, 'no refresh should be issued when neither credential is valid');
        },

        'resolveOrRefresh() with a revoked persistent token resolves to no user (no refresh)' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $sessions = new SessionRepository($pdo);
            $persistentSessions = new PersistentSessionRepository($pdo);
            $service = new CurrentUserService($users, $sessions, 24, $persistentSessions);
            $user = $users->findOrCreateByEmail('refresh-revoked@example.com');
            $persistentId = $persistentSessions->create($user['id'], 'raw-revoked-remember', new \DateTimeImmutable('+90 days'));
            $persistentSessions->revoke($persistentId);

            $result = $service->resolveOrRefresh(null, 'raw-revoked-remember');

            assertTrue($result['user'] === null, 'a revoked persistent credential must not resolve a user');
            assertTrue($result['refreshed_session_token'] === null, 'a revoked persistent credential must not mint a session');
        },

        // me.php's actual request path feeds SessionCredentialResolver::resolve()'s
        // output straight into resolveOrRefresh(). ADR 0001's property is
        // that an ambiguous Bearer/cookie pair -- both otherwise-valid,
        // real sessions for two DIFFERENT users -- must never authenticate
        // as either disputed identity. Existing coverage proves this by
        // construction (resolve()'s ambiguous() case always carries a null
        // token) and unit-tests resolveOrRefresh(null, ...) in isolation,
        // but nothing before this composed the two through real tokens.
        'resolve()\'s ambiguous result, composed into resolveOrRefresh(), never authenticates as either disputed user -- proves the me.php wiring, not either unit alone' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $sessions = new SessionRepository($pdo);
            $persistentSessions = new PersistentSessionRepository($pdo);
            $service = new CurrentUserService($users, $sessions, 24, $persistentSessions);

            $userA = $users->findOrCreateByEmail('ambiguous-a@example.com');
            $userB = $users->findOrCreateByEmail('ambiguous-b@example.com');
            $rawSessionA = $service->createSession($userA['id']);
            $rawSessionB = $service->createSession($userB['id']);

            // Both tokens are real, currently-valid sessions for two
            // different users -- an attacker-controlled Bearer header
            // paired with a victim's session cookie (or vice versa), not
            // a garbage/missing credential.
            assertTrue($service->resolve($rawSessionA) !== null, 'sanity check: session A must resolve on its own');
            assertTrue($service->resolve($rawSessionB) !== null, 'sanity check: session B must resolve on its own');

            $credential = SessionCredentialResolver::resolve($rawSessionA, $rawSessionB);
            assertSame(null, $credential->token, 'a Bearer/cookie pair for two different, otherwise-valid sessions must resolve to a null token');
            assertTrue($credential->ambiguous, 'the resolver must flag this pair as ambiguous');

            $result = $service->resolveOrRefresh($credential->token, null);

            assertSame(null, $result['user'], 'an ambiguous credential pair must never authenticate as either disputed user, even though both tokens are independently valid');
            assertSame(null, $result['refreshed_session_token'], 'an ambiguous credential pair must never mint a refreshed session');
        },

        'resolveOrRefresh() with no PersistentSessionRepository wired (legacy 3-arg construction) never throws, just falls back to no-user' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $service = new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24);

            $result = $service->resolveOrRefresh(null, 'raw-anything');

            assertTrue($result['user'] === null, 'legacy 3-arg construction must fall back to no-user rather than throw');
            assertTrue($result['refreshed_session_token'] === null, 'legacy 3-arg construction must not mint a session');
        },
    ];
}
