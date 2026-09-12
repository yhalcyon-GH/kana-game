<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkTokenRepository.php';

function makeMagicLinkTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
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
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function magicLinkTokenRepositoryTests(): array
{
    return [
        'issue() then consume() with the correct raw token succeeds exactly once' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            $expiresAt = new \DateTimeImmutable('+15 minutes');
            $repo->issue('user@example.com', 'raw-token-abc', $expiresAt);

            assertTrue($repo->consume('raw-token-abc'), 'first consume of a valid token should succeed');
            assertFalse($repo->consume('raw-token-abc'), 'second consume of the same token must fail (single-use)');
        },

        'consume() with an unknown token fails' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            assertFalse($repo->consume('never-issued'), 'an unknown token must not be consumable');
        },

        'consume() with an expired token fails' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            $expiresAt = new \DateTimeImmutable('-1 minute');
            $repo->issue('user@example.com', 'expired-token', $expiresAt);

            assertFalse($repo->consume('expired-token'), 'an expired token must not be consumable');
        },

        'the raw token is never stored in the database' => function () {
            $pdo = makeMagicLinkTestDb();
            $repo = new MagicLinkTokenRepository($pdo);
            $repo->issue('user@example.com', 'super-secret-raw-value', new \DateTimeImmutable('+15 minutes'));

            $rows = $pdo->query('SELECT token_hash FROM magic_link_tokens')->fetchAll();
            foreach ($rows as $row) {
                assertFalse(
                    str_contains($row['token_hash'], 'super-secret-raw-value'),
                    'the raw token value must never appear in a persisted column',
                );
            }
        },

        'findEmailForRawToken() returns the associated email for a known token' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            $repo->issue('find-me@example.com', 'find-token', new \DateTimeImmutable('+15 minutes'));

            assertSame('find-me@example.com', $repo->findEmailForRawToken('find-token'), 'email should match the issued token');
        },

        'findEmailForRawToken() returns null for an unknown token' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            assertSame(null, $repo->findEmailForRawToken('nonexistent'), 'unknown token should return null');
        },

        'bindUser() associates a consumed token with the resolved user' => function () {
            $pdo = makeMagicLinkTestDb();
            $repo = new MagicLinkTokenRepository($pdo);
            $repo->issue('bind-me@example.com', 'bind-token', new \DateTimeImmutable('+15 minutes'));
            $repo->consume('bind-token');

            $repo->bindUser('bind-token', 'user-uuid-123');

            $userId = $pdo->query("SELECT user_id FROM magic_link_tokens WHERE email_normalized = 'bind-me@example.com'")->fetchColumn();
            assertSame('user-uuid-123', $userId, 'user_id should be bound after bindUser()');
        },
    ];
}
