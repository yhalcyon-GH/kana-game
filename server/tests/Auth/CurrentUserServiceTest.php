<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
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
    ];
}
