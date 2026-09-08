<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\SessionRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';

function makeSessionsTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
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

/**
 * @return array<string, callable(): void>
 */
function sessionRepositoryTests(): array
{
    return [
        'create() then findActiveUserIdForRawToken() resolves the correct user' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            $repo->create('user-123', 'session-raw-token', new \DateTimeImmutable('+24 hours'));

            assertSame('user-123', $repo->findActiveUserIdForRawToken('session-raw-token'), 'should resolve to the created user');
        },

        'findActiveUserIdForRawToken() returns null for an unknown token' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            assertSame(null, $repo->findActiveUserIdForRawToken('never-created'), 'unknown token should return null');
        },

        'findActiveUserIdForRawToken() returns null for an expired session' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            $repo->create('user-456', 'expired-session', new \DateTimeImmutable('-1 minute'));

            assertSame(null, $repo->findActiveUserIdForRawToken('expired-session'), 'expired session must not resolve');
        },

        'revoke() invalidates a session (logout)' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            $repo->create('user-789', 'to-be-revoked', new \DateTimeImmutable('+24 hours'));
            $repo->revoke('to-be-revoked');

            assertSame(null, $repo->findActiveUserIdForRawToken('to-be-revoked'), 'a revoked session must not resolve');
        },

        'revoke() on an unknown token does not throw' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            $repo->revoke('never-existed');
            assertTrue(true, 'revoke() on an unknown token should be a safe no-op');
        },

        'the raw session token is never stored in the database' => function () {
            $pdo = makeSessionsTestDb();
            $repo = new SessionRepository($pdo);
            $repo->create('user-abc', 'super-secret-session-value', new \DateTimeImmutable('+24 hours'));

            $rows = $pdo->query('SELECT token_hash FROM sessions')->fetchAll();
            foreach ($rows as $row) {
                assertFalse(
                    str_contains($row['token_hash'], 'super-secret-session-value'),
                    'the raw session token must never appear in a persisted column',
                );
            }
        },
    ];
}
