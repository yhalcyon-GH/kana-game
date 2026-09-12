<?php

declare(strict_types=1);

/**
 * Create a purchase intent for the currently authenticated user.
 *
 * POST /api/purchase-intent.php
 * Header: Authorization: Bearer <raw-session-token>
 * -> 200 {"purchase_ref": "<raw, returned exactly once>"}
 * -> 401 {"error": "unauthorized"}
 *
 * Depends ONLY on CurrentUserService (PR A's session-only resolver) to
 * determine the current user — no Magic Link/rate-limit/mail
 * infrastructure is constructed here, matching the pattern already
 * established by server/auth/me.php and server/auth/logout.php. The
 * browser can never supply a user id: the resolved user comes
 * exclusively from the server-verified session token.
 *
 * The returned purchase_ref is intentionally sent to Paddle by the
 * caller as customData.purchase_ref — see docs/superpowers/specs/
 * 2026-09-08-paddle-auth-entitlement-phase3-design.md, section 4. This
 * endpoint never persists or logs the raw value itself (only its
 * SHA-256 hash is stored, by PurchaseIntentRepository).
 */

require __DIR__ . '/src/Config.php';
require __DIR__ . '/src/Db.php';
require __DIR__ . '/src/Cors.php';
require __DIR__ . '/src/Auth/CurrentUserService.php';
require __DIR__ . '/src/Auth/SessionCredentialResolver.php';
require __DIR__ . '/src/Auth/SessionRepository.php';
require __DIR__ . '/src/Auth/UserRepository.php';
require __DIR__ . '/src/Auth/WebSessionCookie.php';
require __DIR__ . '/src/Purchase/PurchaseIntentRepository.php';
require __DIR__ . '/src/Purchase/PurchaseIntentService.php';
require __DIR__ . '/src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionCredentialResolver;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Auth\WebSessionCookie;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\Purchase\PurchaseIntentRepository;
use KanaGame\Paddle\Purchase\PurchaseIntentService;

const PURCHASE_INTENT_PRODUCT_KEY = 'full_tamamizu';
const PURCHASE_INTENT_EXPIRY_MINUTES = 30;

$config = Config::load();
$cors = new Cors($config->allowedOrigins(), null, $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $cors->applyPreflightHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
    http_response_code(204);
    exit;
}

$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$webSessionCookie = new WebSessionCookie(
    $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true',
    $config->get('WEB_SESSION_COOKIE_NAME') ?? WebSessionCookie::DEFAULT_NAME,
);
$cookieToken = $webSessionCookie->readToken($_COOKIE);

// CSRF defense-in-depth for the cookie transport -- see the identical
// check and comment in server/auth/logout.php. This endpoint creates a
// purchase intent (a real, if low-value, side effect), so it gets the
// same Origin verification as logout.
if ($cookieToken !== null && !$cors->isOriginAllowed($_SERVER['HTTP_ORIGIN'] ?? null)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$rawSessionToken = SessionCredentialResolver::resolve(
    SessionCredentialResolver::extractBearerToken($_SERVER['HTTP_AUTHORIZATION'] ?? null),
    $cookieToken,
);

if ($rawSessionToken === null) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

try {
    $pdo = Db::connect($config);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
    );
    $service = new PurchaseIntentService(
        new PurchaseIntentRepository($pdo),
        $currentUser,
        PURCHASE_INTENT_EXPIRY_MINUTES,
    );
    $rawPurchaseRef = $service->createIntent($rawSessionToken, PURCHASE_INTENT_PRODUCT_KEY);
} catch (\Throwable $e) {
    // NEVER log $e->getMessage() -- a DB exception could carry a raw
    // purchase_ref or session-token-derived data. Log only the
    // exception's class, matching PR A's auth-entrypoint discipline.
    error_log('purchase-intent.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($rawPurchaseRef === null) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

echo json_encode(['purchase_ref' => $rawPurchaseRef]);
