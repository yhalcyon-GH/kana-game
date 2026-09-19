<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\PaddleEnvironmentConfig;
use KanaGame\Paddle\Purchase\PurchaseIntentEndpoint;
use KanaGame\Paddle\Purchase\PurchaseIntentRepository;
use KanaGame\Paddle\Purchase\PurchaseIntentService;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Config.php';
require_once __DIR__ . '/../../src/PaddleEnvironmentConfig.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseIntentRepository.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseIntentService.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseIntentEndpoint.php';
require_once __DIR__ . '/../../src/Uuid.php';

/**
 * @return array{endpoint: PurchaseIntentEndpoint, pdo: PDO, currentUser: CurrentUserService}
 */
function makePurchaseIntentEndpointHarness(string $serverEnvironment): array
{
    // Reuses PurchaseIntentServiceTest.php's exact SQLite schema/harness
    // shape -- PurchaseIntentEndpoint wraps PurchaseIntentService
    // unchanged, so the underlying persistence story is identical.
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

    $currentUser = new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24);
    $service = new PurchaseIntentService(new PurchaseIntentRepository($pdo), $currentUser, 30);

    $environmentValues = $serverEnvironment === 'live'
        ? ['PADDLE_ENVIRONMENT' => 'live', 'PADDLE_LIVE_WEBHOOK_SECRET' => 'live-secret', 'PADDLE_LIVE_FULL_TAMAMIZU_PRICE_ID' => 'pri_live', 'PADDLE_LIVE_FULL_TAMAMIZU_PRODUCT_ID' => 'pro_live']
        : ['PADDLE_ENVIRONMENT' => 'sandbox', 'PADDLE_SANDBOX_WEBHOOK_SECRET' => 'sandbox-secret', 'PADDLE_SANDBOX_FULL_TAMAMIZU_PRICE_ID' => 'pri_sandbox', 'PADDLE_SANDBOX_FULL_TAMAMIZU_PRODUCT_ID' => 'pro_sandbox'];
    $environmentConfig = PaddleEnvironmentConfig::resolve(Config::fromArray($environmentValues));

    $endpoint = new PurchaseIntentEndpoint($environmentConfig, $service);

    return ['endpoint' => $endpoint, 'pdo' => $pdo, 'currentUser' => $currentUser];
}

function pieMakeAuthenticatedSession(array $harness, string $email = 'buyer@example.com'): string
{
    $users = new UserRepository($harness['pdo']);
    $user = $users->findOrCreateByEmail($email);
    return $harness['currentUser']->createSession($user['id']);
}

function pieIntentCount(PDO $pdo): int
{
    return (int) $pdo->query('SELECT COUNT(*) FROM purchase_intents')->fetchColumn();
}

/**
 * @return array<string, callable(): void>
 */
function purchaseIntentEndpointTests(): array
{
    return [
        // -- Phase H2: the core environment-assertion gap fix --

        'server sandbox + client sandbox -- intent created successfully' => function () {
            $h = makePurchaseIntentEndpointHarness('sandbox');
            $session = pieMakeAuthenticatedSession($h);

            $result = $h['endpoint']->handle('sandbox', $session, 'full_tamamizu');

            assertSame(200, $result['status'], 'matching sandbox/sandbox should succeed');
            assertTrue(is_string($result['body']['purchase_ref'] ?? null) && $result['body']['purchase_ref'] !== '', 'a purchase_ref should be returned');
            assertSame('sandbox', $result['body']['environment'], 'the response must echo the authoritative server environment');
            assertSame(1, pieIntentCount($h['pdo']), 'exactly one purchase_intents row should exist');
        },

        'server live + client live -- intent created successfully' => function () {
            $h = makePurchaseIntentEndpointHarness('live');
            $session = pieMakeAuthenticatedSession($h);

            $result = $h['endpoint']->handle('live', $session, 'full_tamamizu');

            assertSame(200, $result['status'], 'matching live/live should succeed');
            assertSame('live', $result['body']['environment'], 'the response must echo the authoritative server environment');
            assertSame(1, pieIntentCount($h['pdo']), 'exactly one purchase_intents row should exist');
        },

        'server sandbox + client live -- rejected, no intent row created' => function () {
            $h = makePurchaseIntentEndpointHarness('sandbox');
            $session = pieMakeAuthenticatedSession($h);

            $result = $h['endpoint']->handle('live', $session, 'full_tamamizu');

            assertSame(409, $result['status'], 'a client asserting live against a sandbox server must be rejected with 409');
            assertSame(0, pieIntentCount($h['pdo']), 'no purchase_intents row may be created on an environment mismatch');
        },

        'server live + client sandbox -- rejected, no intent row created' => function () {
            $h = makePurchaseIntentEndpointHarness('live');
            $session = pieMakeAuthenticatedSession($h);

            $result = $h['endpoint']->handle('sandbox', $session, 'full_tamamizu');

            assertSame(409, $result['status'], 'a client asserting sandbox against a live server must be rejected with 409');
            assertSame(0, pieIntentCount($h['pdo']), 'no purchase_intents row may be created on an environment mismatch');
        },

        'missing/invalid client environment -- rejected, no intent row created' => function () {
            $h = makePurchaseIntentEndpointHarness('sandbox');
            $session = pieMakeAuthenticatedSession($h);

            foreach ([null, '', 'production', 'Sandbox', 'LIVE', 123, true, []] as $bad) {
                $result = $h['endpoint']->handle($bad, $session, 'full_tamamizu');
                assertSame(400, $result['status'], 'a missing/invalid client-asserted environment must be rejected with 400: ' . var_export($bad, true));
            }
            assertSame(0, pieIntentCount($h['pdo']), 'no purchase_intents row may be created for any malformed client assertion');
        },

        'client environment assertion never selects which server config is used -- it can only reject, matching against sandbox proves live keys were never touched' => function () {
            $h = makePurchaseIntentEndpointHarness('sandbox');
            $session = pieMakeAuthenticatedSession($h);

            // A client asserting 'live' must be rejected outright, never
            // silently routed to (nonexistent, in this harness) live
            // config or treated as if it were sandbox.
            $result = $h['endpoint']->handle('live', $session, 'full_tamamizu');
            assertSame(409, $result['status'], 'a live assertion against a sandbox server must be rejected');
            assertSame('sandbox', $h['endpoint']->handle('sandbox', $session, 'full_tamamizu')['body']['environment'], 'the server environment is unaffected by the earlier rejected assertion');
        },

        // -- Unauthenticated / unknown-user path is unaffected by the new check --

        'a matching environment with an invalid session still returns 401, not an intent' => function () {
            $h = makePurchaseIntentEndpointHarness('sandbox');

            $result = $h['endpoint']->handle('sandbox', 'bogus-session-token', 'full_tamamizu');

            assertSame(401, $result['status'], 'an invalid session must still be rejected, even with a matching environment');
            assertSame(0, pieIntentCount($h['pdo']), 'no purchase_intents row may be created for an unauthenticated request');
        },
    ];
}
