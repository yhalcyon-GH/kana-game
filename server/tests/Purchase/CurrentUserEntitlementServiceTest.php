<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\Purchase\CurrentUserEntitlementService;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/../../src/EntitlementRepository.php';
require_once __DIR__ . '/../../src/Purchase/CurrentUserEntitlementService.php';
require_once __DIR__ . '/../../src/Uuid.php';

function makeCurrentUserEntitlementServiceTestDb(): PDO
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
        'CREATE TABLE entitlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            internal_user_id TEXT NOT NULL,
            product_key TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 0,
            paddle_transaction_id TEXT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (internal_user_id, product_key)
        )',
    );
    return $pdo;
}

/**
 * @return array{service: CurrentUserEntitlementService, pdo: PDO, currentUser: CurrentUserService}
 */
function makeCurrentUserEntitlementServiceHarness(): array
{
    $pdo = makeCurrentUserEntitlementServiceTestDb();
    $currentUser = new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24);
    $service = new CurrentUserEntitlementService($currentUser, new EntitlementRepository($pdo), 'full_tamamizu');

    return ['service' => $service, 'pdo' => $pdo, 'currentUser' => $currentUser];
}

/**
 * @return array<string, callable(): void>
 */
function currentUserEntitlementServiceTests(): array
{
    return [
        'the current authenticated user can read their own entitlement' => function () {
            $h = makeCurrentUserEntitlementServiceHarness();
            $users = new UserRepository($h['pdo']);
            $user = $users->findOrCreateByEmail('buyer@example.com');
            $sessionToken = $h['currentUser']->createSession($user['id']);
            (new EntitlementRepository($h['pdo']))->activate($user['id'], 'full_tamamizu', 'txn_1');

            $result = $h['service']->lookupForSession($sessionToken);

            assertTrue($result !== null, 'a valid session should resolve');
            assertSame($user['id'], $result['user_id'], 'user_id should match the authenticated user');
            assertTrue($result['active'], 'entitlement should be active');
        },

        'active entitlement returns active=true' => function () {
            $h = makeCurrentUserEntitlementServiceHarness();
            $users = new UserRepository($h['pdo']);
            $user = $users->findOrCreateByEmail('active-user@example.com');
            $sessionToken = $h['currentUser']->createSession($user['id']);
            (new EntitlementRepository($h['pdo']))->activate($user['id'], 'full_tamamizu', 'txn_active');

            $result = $h['service']->lookupForSession($sessionToken);
            assertTrue($result['active'], 'should report active=true');
        },

        'refunded/no-valid-grant state returns active=false' => function () {
            $h = makeCurrentUserEntitlementServiceHarness();
            $users = new UserRepository($h['pdo']);
            $user = $users->findOrCreateByEmail('refunded-user@example.com');
            $sessionToken = $h['currentUser']->createSession($user['id']);
            $entitlements = new EntitlementRepository($h['pdo']);
            $entitlements->activate($user['id'], 'full_tamamizu', 'txn_x');
            $entitlements->revoke($user['id'], 'full_tamamizu', 'txn_x');

            $result = $h['service']->lookupForSession($sessionToken);
            assertFalse($result['active'], 'should report active=false after revoke');
        },

        'a user with no entitlement row at all returns active=false, not an error' => function () {
            $h = makeCurrentUserEntitlementServiceHarness();
            $users = new UserRepository($h['pdo']);
            $user = $users->findOrCreateByEmail('never-purchased@example.com');
            $sessionToken = $h['currentUser']->createSession($user['id']);

            $result = $h['service']->lookupForSession($sessionToken);
            assertTrue($result !== null, 'a valid session should still resolve');
            assertFalse($result['active'], 'no entitlement row should mean active=false');
        },

        'an invalid/unknown session token returns null (401 at the entrypoint)' => function () {
            $h = makeCurrentUserEntitlementServiceHarness();
            assertSame(null, $h['service']->lookupForSession('bogus-token'), 'an invalid session must not resolve');
        },

        // -- Explicitly requested: no ?user_id= override, and cross-user isolation --

        'user A cannot read user B\'s entitlement -- the service has no parameter for choosing another user at all' => function () {
            $h = makeCurrentUserEntitlementServiceHarness();
            $users = new UserRepository($h['pdo']);
            $userA = $users->findOrCreateByEmail('a@example.com');
            $userB = $users->findOrCreateByEmail('b@example.com');
            $sessionA = $h['currentUser']->createSession($userA['id']);
            (new EntitlementRepository($h['pdo']))->activate($userB['id'], 'full_tamamizu', 'txn_b');

            $result = $h['service']->lookupForSession($sessionA);

            assertSame($userA['id'], $result['user_id'], 'the lookup must resolve to the SESSION\'S owner (A), never a different user');
            assertFalse($result['active'], 'A has no entitlement of their own -- B\'s entitlement must not leak to A regardless of B having one');
        },

        'lookupForSession() has no way to accept a caller-supplied user id -- reflection confirms a single string parameter' => function () {
            $reflection = new \ReflectionMethod(CurrentUserEntitlementService::class, 'lookupForSession');
            $parameters = $reflection->getParameters();
            assertSame(1, count($parameters), 'lookupForSession() must take exactly one parameter (the session token) -- no user-id parameter of any kind can exist');
            assertSame('rawSessionToken', $parameters[0]->getName(), 'the sole parameter must be the session token, not a user identifier');
        },

        'repurchase scenario: entitlement re-activated after a prior revoke still reports active=true (one valid grant is enough)' => function () {
            // Mirrors the design spec's repurchase-survives-old-refund
            // property at the entitlement-read layer: whatever
            // PurchaseWebhookHandler's recomputeEntitlement() last wrote
            // to the entitlements cache is exactly what this service
            // reports -- it does no separate "which transaction" logic
            // of its own, so a user with one currently-valid grant among
            // any history of past activate/revoke calls reads as
            // entitled.
            $h = makeCurrentUserEntitlementServiceHarness();
            $users = new UserRepository($h['pdo']);
            $user = $users->findOrCreateByEmail('repurchase@example.com');
            $sessionToken = $h['currentUser']->createSession($user['id']);
            $entitlements = new EntitlementRepository($h['pdo']);

            // Transaction A: activate, then revoke (refunded).
            $entitlements->activate($user['id'], 'full_tamamizu', 'txn_A');
            $entitlements->revoke($user['id'], 'full_tamamizu', 'txn_A');
            // Transaction B: a later repurchase re-activates the cache.
            $entitlements->activate($user['id'], 'full_tamamizu', 'txn_B');

            $result = $h['service']->lookupForSession($sessionToken);
            assertTrue($result['active'], 'the repurchase (txn_B) should leave the user entitled');
        },
    ];
}
