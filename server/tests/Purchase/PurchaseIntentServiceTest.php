<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Purchase\PurchaseIntentRepository;
use KanaGame\Paddle\Purchase\PurchaseIntentService;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseIntentRepository.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseIntentService.php';
require_once __DIR__ . '/../../src/Uuid.php';

function makePurchaseIntentServiceTestDb(): PDO
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
    $pdo->exec(
        'CREATE TABLE purchase_intents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_ref_hash TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            product_key TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT NULL,
            paddle_transaction_id TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array{service: PurchaseIntentService, pdo: PDO, currentUser: CurrentUserService}
 */
function makePurchaseIntentServiceHarness(): array
{
    $pdo = makePurchaseIntentServiceTestDb();
    $currentUser = new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24);
    $service = new PurchaseIntentService(new PurchaseIntentRepository($pdo), $currentUser, 30);

    return ['service' => $service, 'pdo' => $pdo, 'currentUser' => $currentUser];
}

/**
 * @return array<string, callable(): void>
 */
function purchaseIntentServiceTests(): array
{
    return [
        'createIntent() with an invalid session token returns null (auth required)' => function () {
            $h = makePurchaseIntentServiceHarness();
            assertSame(null, $h['service']->createIntent('bogus-session-token', 'full_tamamizu'), 'an invalid session must not create an intent');
        },

        'createIntent() with a valid session returns a raw purchase_ref bound to the authenticated user' => function () {
            $h = makePurchaseIntentServiceHarness();
            $users = new UserRepository($h['pdo']);
            $user = $users->findOrCreateByEmail('buyer@example.com');
            $sessionToken = $h['currentUser']->createSession($user['id']);

            $rawRef = $h['service']->createIntent($sessionToken, 'full_tamamizu');
            assertTrue($rawRef !== null, 'a valid session should produce a raw purchase_ref');

            $intentRepo = new PurchaseIntentRepository($h['pdo']);
            $boundUserId = $intentRepo->findUserIdForHash(hash('sha256', $rawRef));
            assertSame($user['id'], $boundUserId, 'the intent must be bound to the AUTHENTICATED user, never a caller-supplied id');
        },

        'createIntent() does not persist the raw purchase_ref anywhere' => function () {
            $h = makePurchaseIntentServiceHarness();
            $users = new UserRepository($h['pdo']);
            $user = $users->findOrCreateByEmail('buyer2@example.com');
            $sessionToken = $h['currentUser']->createSession($user['id']);

            $rawRef = $h['service']->createIntent($sessionToken, 'full_tamamizu');

            $rows = $h['pdo']->query('SELECT purchase_ref_hash FROM purchase_intents')->fetchAll();
            foreach ($rows as $row) {
                assertFalse(str_contains($row['purchase_ref_hash'], $rawRef), 'the raw purchase_ref must never appear in a persisted column');
            }
        },

        'createIntent() generates a different purchase_ref on each call' => function () {
            $h = makePurchaseIntentServiceHarness();
            $users = new UserRepository($h['pdo']);
            $user = $users->findOrCreateByEmail('buyer3@example.com');
            $sessionToken = $h['currentUser']->createSession($user['id']);

            $first = $h['service']->createIntent($sessionToken, 'full_tamamizu');
            $second = $h['service']->createIntent($sessionToken, 'full_tamamizu');

            assertFalse($first === $second, 'two calls should not produce the same raw purchase_ref');
        },

        'two different users each get intents bound to their own user_id, never to each other' => function () {
            $h = makePurchaseIntentServiceHarness();
            $users = new UserRepository($h['pdo']);
            $userA = $users->findOrCreateByEmail('a@example.com');
            $userB = $users->findOrCreateByEmail('b@example.com');
            $sessionA = $h['currentUser']->createSession($userA['id']);
            $sessionB = $h['currentUser']->createSession($userB['id']);

            $refA = $h['service']->createIntent($sessionA, 'full_tamamizu');
            $refB = $h['service']->createIntent($sessionB, 'full_tamamizu');

            $intentRepo = new PurchaseIntentRepository($h['pdo']);
            assertSame($userA['id'], $intentRepo->findUserIdForHash(hash('sha256', $refA)), 'A\'s intent must belong to A');
            assertSame($userB['id'], $intentRepo->findUserIdForHash(hash('sha256', $refB)), 'B\'s intent must belong to B');
        },
    ];
}
