<?php

declare(strict_types=1);

/**
 * Read-only entitlement lookup for the CURRENT AUTHENTICATED USER only
 * — the Phase 3A real-user path.
 *
 * GET /api/entitlement-me.php
 * Header: Authorization: Bearer <raw-session-token>
 * -> 200 {"user_id": "...", "product": "full_tamamizu", "active": true|false, "updated_at": "..."}
 * -> 401 {"error": "unauthorized"}
 * -> 500 {"error": "temporary server error"}
 *
 * Deliberately accepts NO ?user_id= parameter — identity and product
 * are entirely server-controlled (see CurrentUserEntitlementService,
 * whose lookupForSession() takes only a session token, structurally
 * incapable of accepting a caller-supplied user id or product key).
 * This is a separate endpoint from server/entitlement.php (Phase 2's
 * PoC endpoint, which only ever accepts the single fixed
 * SandboxUser::ID and remains unchanged as a development-only
 * compatibility path).
 *
 * This file is intentionally a thin HTTP adapter: Authorization header
 * in, CurrentUserEntitlementService call, JSON response out. All actual
 * lookup logic lives in that service, where it's unit-tested (see
 * server/tests/Purchase/CurrentUserEntitlementServiceTest.php). This
 * endpoint never writes anything — entitlement state is only ever
 * changed by a signature-verified Paddle webhook (see
 * server/paddle-webhook.php / PurchaseWebhookHandler).
 */

require __DIR__ . '/src/Config.php';
require __DIR__ . '/src/Db.php';
require __DIR__ . '/src/Cors.php';
require __DIR__ . '/src/EntitlementRepository.php';
require __DIR__ . '/src/Auth/CurrentUserService.php';
require __DIR__ . '/src/Auth/SessionRepository.php';
require __DIR__ . '/src/Auth/UserRepository.php';
require __DIR__ . '/src/Purchase/CurrentUserEntitlementService.php';
require __DIR__ . '/src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\Purchase\CurrentUserEntitlementService;

const ENTITLEMENT_ME_PRODUCT_KEY = 'full_tamamizu';

$config = Config::load();
$cors = new Cors($config->allowedOrigins());

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $cors->applyPreflightHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
    http_response_code(204);
    exit;
}

$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!str_starts_with($authHeader, 'Bearer ')) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}
$rawSessionToken = substr($authHeader, strlen('Bearer '));

try {
    $pdo = Db::connect($config);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
    );
    $service = new CurrentUserEntitlementService(
        $currentUser,
        new EntitlementRepository($pdo),
        ENTITLEMENT_ME_PRODUCT_KEY,
    );
    $result = $service->lookupForSession($rawSessionToken);
} catch (\Throwable $e) {
    error_log('entitlement-me.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($result === null) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

echo json_encode($result);
