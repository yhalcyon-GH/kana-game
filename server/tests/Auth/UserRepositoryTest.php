<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';

function makeUsersTestDb(): PDO
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
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function userRepositoryTests(): array
{
    return [
        'findOrCreateByEmail() creates a new user when none exists' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            $user = $repo->findOrCreateByEmail('new@example.com');

            assertSame('new@example.com', $user['email_normalized'], 'email should match');
            assertTrue(strlen($user['id']) === 36, 'id should be a 36-character UUID string');
        },

        'findOrCreateByEmail() returns the same user on a second call for the same email' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            $first = $repo->findOrCreateByEmail('repeat@example.com');
            $second = $repo->findOrCreateByEmail('repeat@example.com');

            assertSame($first['id'], $second['id'], 'the same email must resolve to the same user id');
        },

        'findOrCreateByEmail() does not create a duplicate row for the same email' => function () {
            $pdo = makeUsersTestDb();
            $repo = new UserRepository($pdo);
            $repo->findOrCreateByEmail('dup@example.com');
            $repo->findOrCreateByEmail('dup@example.com');

            $count = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE email_normalized = 'dup@example.com'")->fetchColumn();
            assertSame(1, $count, 'exactly one row should exist for this email');
        },

        'findById() returns null when no user exists with that id' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            assertSame(null, $repo->findById('00000000-0000-4000-8000-000000000000'), 'unknown id should return null');
        },

        'findById() returns the user created by findOrCreateByEmail()' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            $created = $repo->findOrCreateByEmail('lookup@example.com');
            $found = $repo->findById($created['id']);

            assertTrue($found !== null, 'user should be found by id');
            assertSame('lookup@example.com', $found['email_normalized'], 'email should match');
        },

        'different emails resolve to different user ids' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            $a = $repo->findOrCreateByEmail('a@example.com');
            $b = $repo->findOrCreateByEmail('b@example.com');

            assertFalse($a['id'] === $b['id'], 'different emails must not collide on the same user id');
        },
    ];
}
