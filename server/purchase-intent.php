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
 * Also uses CurrentUserService::resolveOrRefresh(), exactly like
 * server/auth/me.php and server/auth/sign-out-others.php: when the
 * session cookie is missing/expired but a valid, still-active
 * remember-me (persistent-session) cookie is present, this
 * transparently mints a fresh session and reissues it as a new
 * Set-Cookie before delegating to PurchaseIntentEndpoint::handle() /
 * PurchaseIntentService::createIntent() with whichever session token is
 * now valid — no user-visible re-login, and no change to that service's
 * own resolve()-only-based signature/tests.
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
require __DIR__ . '/src/Auth/PersistentSessionRepository.php';
require __DIR__ . '/src/Auth/SessionCredentialResolver.php';
require __DIR__ . '/src/Auth/SessionRepository.php';
require __DIR__ . '/src/Auth/UserRepository.php';
require __DIR__ . '/src/Auth/WebSessionCookie.php';
require __DIR__ . '/src/Purchase/PurchaseIntentRepository.php';
require __DIR__ . '/src/Purchase/PurchaseIntentService.php';
require __DIR__ . '/src/Purchase/PurchaseIntentEndpoint.php';
require __DIR__ . '/src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
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
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$webSessionCookie = new WebSessionCookie(
    $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true',
    $config->get('WEB_SESSION_COOKIE_NAME') ?? WebSessionCookie::DEFAULT_NAME,
);
$rememberCookie = new WebSessionCookie(
    $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true',
    $config->get('PERSISTENT_LOGIN_COOKIE_NAME') ?? '__Host-tamamizu_remember',
);
$cookieToken = $webSessionCookie->readToken($_COOKIE);
$rememberToken = $rememberCookie->readToken($_COOKIE);

// CSRF defense-in-depth for the cookie transport -- see the identical
// check and comment in server/auth/logout.php and server/auth/
// sign-out-others.php. This endpoint creates a purchase intent (a real,
// if low-value, side effect), so it gets the same Origin verification
// as logout/sign-out-others. This must check both cookies, not just the
// session cookie: this endpoint now authenticates via
// resolveOrRefresh(), which can succeed from the remember cookie ALONE
// (session cookie missing/expired) and still create a real
// purchase_intents row -- a state change that must be Origin-checked
// regardless of which of the two cookies is present, not just the
// session cookie. A Bearer-only caller (no cookie at all) is entirely
// unaffected by this check.
if (($cookieToken !== null || $rememberToken !== null) && !$cors->isOriginAllowed($_SERVER['HTTP_ORIGIN'] ?? null)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$credential = SessionCredentialResolver::resolve(
    SessionCredentialResolver::extractBearerToken($_SERVER['HTTP_AUTHORIZATION'] ?? null),
    $cookieToken,
);

// Security-review finding: an ambiguous (Bearer != cookie) credential
// must be rejected outright, matching auth/logout.php's own ambiguous
// branch -- it must NEVER be allowed to fall through into
// resolveOrRefresh()'s remember-cookie fallback below. $credential->token
// is null for both a genuinely MISSING credential and an AMBIGUOUS one,
// but those two are not the same thing: SessionCredentialResolution
// exists specifically so a caller can tell them apart, and a
// state-changing endpoint (this one creates a real purchase_intents row)
// must use that distinction rather than silently folding "disagreeing
// credentials" into "no credentials." A missing credential still falls
// through below to the remember-cookie refresh path exactly as before.
// This check runs AFTER the Origin/CSRF check above (so a cross-origin
// request is still rejected first regardless of credential shape) and
// BEFORE any DB/auth work.
if ($credential->ambiguous) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

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
    $persistentSessions = new PersistentSessionRepository($pdo);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
        $persistentSessions,
    );

    // resolveOrRefresh() FIRST, before PurchaseIntentEndpoint::handle()
    // ever runs -- see the identical seam in auth/me.php and auth/
    // sign-out-others.php. An ambiguous credential was already rejected
    // above, before this try block; only a genuinely MISSING session
    // credential reaches here and gets a chance to transparently
    // re-authenticate from a genuinely valid remember-me credential.
    $resolution = $currentUser->resolveOrRefresh($credential->token, $rememberToken);
    if ($resolution['user'] === null) {
        // Match PurchaseIntentEndpoint::handle()'s own 401 body exactly
        // -- do not call the existing service/endpoint at all on this
        // path, avoiding an unreachable double-401.
        http_response_code(401);
        echo json_encode(['error' => 'unauthorized']);
        exit;
    }

    // If resolveOrRefresh() minted a fresh session (the original session
    // token was missing/expired but the remember cookie was valid), that
    // NEW token is what must be handed to PurchaseIntentEndpoint::
    // handle() / PurchaseIntentService::createIntent() -- it was just
    // created in this same request and resolves cleanly; the original
    // (possibly missing/expired) token would not. Otherwise pass the
    // original credential token through unchanged -- those classes'
    // own signature/behavior (session-only, via CurrentUserService::
    // resolve()) is unchanged by this file.
    $sessionTokenForIntent = $resolution['refreshed_session_token'] ?? $credential->token;

    $service = new PurchaseIntentService(
        new PurchaseIntentRepository($pdo),
        $currentUser,
        PURCHASE_INTENT_EXPIRY_MINUTES,
    );
    $endpoint = new PurchaseIntentEndpoint($environmentConfig, $service);
    $result = $endpoint->handle($clientAssertedEnvironment, $sessionTokenForIntent, PURCHASE_INTENT_PRODUCT_KEY);
} catch (\Throwable $e) {
    // NEVER log $e->getMessage() -- a DB exception could carry a raw
    // purchase_ref or session-token-derived data. Log only the
    // exception's class, matching PR A's auth-entrypoint discipline.
    error_log('purchase-intent.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($resolution['refreshed_session_token'] !== null && $webSessionCookie->isEnabled()) {
    $newExpiresAt = new \DateTimeImmutable('+' . $config->intWithDefault('SESSION_EXPIRY_HOURS', 24) . ' hours');
    header('Set-Cookie: ' . $webSessionCookie->issueHeader($resolution['refreshed_session_token'], $newExpiresAt), false);
}

http_response_code($result['status']);
echo json_encode($result['body']);
