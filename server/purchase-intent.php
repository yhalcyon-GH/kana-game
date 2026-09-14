<?php

declare(strict_types=1);

/**
 * Create a purchase intent for the currently authenticated user.
 *
 * POST /api/purchase-intent.php
 * Header: Authorization: Bearer <raw-session-token>
 * Body: {"environment": "sandbox"|"live"} -- the CALLER's own configured
 *   Paddle environment, asserted so the server can refuse to proceed on
 *   a mismatch (see the Phase H2 environment-assertion block below).
 *   NEVER used to select which server-side environment config is used
 *   -- PADDLE_ENVIRONMENT (via PaddleEnvironmentConfig) is always the
 *   sole authority for that; a client-supplied value can only cause a
 *   request to be REJECTED, never redirect it to a different config.
 * -> 200 {"purchase_ref": "<raw, returned exactly once>", "environment": "sandbox"|"live"}
 * -> 400 {"error": "..."} -- missing/invalid environment in the request body
 * -> 401 {"error": "unauthorized"}
 * -> 409 {"error": "..."} -- environment does not match this server's PADDLE_ENVIRONMENT
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
 *
 * Phase H2 (environment-assertion gap fix): frontend
 * VITE_PADDLE_ENVIRONMENT and backend PADDLE_ENVIRONMENT were
 * previously independent, with no mechanical check that they agree
 * before a checkout could open -- a frontend/backend environment
 * mismatch (e.g. frontend configured for Live, backend still on
 * Sandbox) would let a real Live payment complete while this backend
 * could never process the matching webhook (wrong secret/catalog),
 * leaving the payer charged but never entitled. This endpoint now
 * requires the caller to assert its own configured environment and
 * rejects (409) before creating any purchase_intents row if it
 * disagrees with PaddleEnvironmentConfig::resolve()'s authoritative
 * value -- see docs/paddle-environment-separation.md.
 */

require __DIR__ . '/src/Config.php';
require __DIR__ . '/src/PaddleEnvironmentConfig.php';
require __DIR__ . '/src/Db.php';
require __DIR__ . '/src/Cors.php';
require __DIR__ . '/src/Auth/CurrentUserService.php';
require __DIR__ . '/src/Auth/SessionCredentialResolver.php';
require __DIR__ . '/src/Auth/SessionRepository.php';
require __DIR__ . '/src/Auth/UserRepository.php';
require __DIR__ . '/src/Auth/WebSessionCookie.php';
require __DIR__ . '/src/Purchase/PurchaseIntentRepository.php';
require __DIR__ . '/src/Purchase/PurchaseIntentService.php';
require __DIR__ . '/src/Purchase/PurchaseIntentEndpoint.php';
require __DIR__ . '/src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionCredentialResolver;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Auth\WebSessionCookie;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\PaddleEnvironmentConfig;
use KanaGame\Paddle\Purchase\PurchaseIntentEndpoint;
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

$credential = SessionCredentialResolver::resolve(
    SessionCredentialResolver::extractBearerToken($_SERVER['HTTP_AUTHORIZATION'] ?? null),
    $cookieToken,
);

// A missing credential and an ambiguous one both mean "not
// authenticated" here -- see the identical comment in auth/me.php.
if ($credential->token === null) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}
$rawSessionToken = $credential->token;

// Phase H2 -- read the caller's asserted environment from the request
// body. This is a CLAIM, not a selection: PurchaseIntentEndpoint::handle()
// compares it against the server's own authoritative PaddleEnvironmentConfig
// and can only reject the request on a mismatch, never choose which
// config this server actually uses.
$rawBody = file_get_contents('php://input');
/** @var mixed $payload */
$payload = $rawBody === false ? null : json_decode($rawBody, true);
$clientAssertedEnvironment = is_array($payload) ? ($payload['environment'] ?? null) : null;

try {
    // Fails closed (throws) on a missing/unknown PADDLE_ENVIRONMENT or a
    // missing key for the selected environment -- see
    // PaddleEnvironmentConfig's own doc comment. No purchase_intents row
    // is ever created if this throws.
    $environmentConfig = PaddleEnvironmentConfig::resolve($config);
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
    $endpoint = new PurchaseIntentEndpoint($environmentConfig, $service);
    $result = $endpoint->handle($clientAssertedEnvironment, $rawSessionToken, PURCHASE_INTENT_PRODUCT_KEY);
} catch (\Throwable $e) {
    // NEVER log $e->getMessage() -- a DB exception could carry a raw
    // purchase_ref or session-token-derived data. Log only the
    // exception's class, matching PR A's auth-entrypoint discipline.
    error_log('purchase-intent.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

http_response_code($result['status']);
echo json_encode($result['body']);
