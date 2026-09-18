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
 *
 * Also uses CurrentUserService::resolveOrRefresh(), exactly like
 * server/auth/me.php: when the session cookie is missing/expired but a
 * valid, still-active remember-me (persistent-session) cookie is
 * present, this transparently mints a fresh session and reissues it as
 * a new Set-Cookie before delegating to CurrentUserEntitlementService::
 * lookupForSession() with whichever session token is now valid — no
 * user-visible re-login, and no change to that service's own
 * resolve()-only-based signature/tests. Same Issue #304 side-effecting-
 * GET rationale and Cache-Control: no-store mitigation as server/auth/
 * me.php — see that file's doc comment.
 */

require __DIR__ . '/src/Config.php';
require __DIR__ . '/src/Db.php';
require __DIR__ . '/src/Cors.php';
require __DIR__ . '/src/EntitlementRepository.php';
require __DIR__ . '/src/Auth/CurrentUserService.php';
require __DIR__ . '/src/Auth/PersistentSessionRepository.php';
require __DIR__ . '/src/Auth/SessionCredentialResolver.php';
require __DIR__ . '/src/Auth/SessionRepository.php';
require __DIR__ . '/src/Auth/UserRepository.php';
require __DIR__ . '/src/Auth/WebSessionCookie.php';
require __DIR__ . '/src/Purchase/CurrentUserEntitlementService.php';
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
use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\Purchase\CurrentUserEntitlementService;

const ENTITLEMENT_ME_PRODUCT_KEY = 'full_tamamizu';

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

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
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
$credential = SessionCredentialResolver::resolve(
    SessionCredentialResolver::extractBearerToken($_SERVER['HTTP_AUTHORIZATION'] ?? null),
    $webSessionCookie->readToken($_COOKIE),
);
$rememberToken = $rememberCookie->readToken($_COOKIE);

// Security-review finding: an ambiguous (Bearer != cookie) credential
// must be rejected outright, matching auth/logout.php's own ambiguous
// branch -- it must NEVER be allowed to fall through into
// resolveOrRefresh()'s remember-cookie fallback. $credential->token is
// null for both a genuinely MISSING credential and an AMBIGUOUS one, but
// those two are not the same thing: SessionCredentialResolution exists
// specifically so a caller can tell them apart, and this endpoint must
// use that distinction rather than silently folding "disagreeing
// credentials" into "no credentials." A missing credential still falls
// through below to the remember-cookie refresh path exactly as before.
if ($credential->ambiguous) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

try {
    $pdo = Db::connect($config);
    $persistentSessions = new PersistentSessionRepository($pdo);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
        $persistentSessions,
    );
    $resolution = $currentUser->resolveOrRefresh($credential->token, $rememberToken);

    if ($resolution['user'] === null) {
        http_response_code(401);
        echo json_encode(['error' => 'unauthorized']);
        exit;
    }

    // If resolveOrRefresh() minted a fresh session (the original session
    // token was missing/expired but the remember cookie was valid), that
    // NEW token is what must be handed to CurrentUserEntitlementService::
    // lookupForSession() -- it was just created in this same request and
    // resolves cleanly; the original (possibly missing/expired) token
    // would not. Otherwise pass the original credential token through
    // unchanged -- lookupForSession()'s own signature/behavior (session-
    // only, via CurrentUserService::resolve()) is unchanged by this file.
    $sessionTokenForLookup = $resolution['refreshed_session_token'] ?? $credential->token;

    $service = new CurrentUserEntitlementService(
        $currentUser,
        new EntitlementRepository($pdo),
        ENTITLEMENT_ME_PRODUCT_KEY,
    );
    $result = $service->lookupForSession($sessionTokenForLookup);
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

if ($resolution['refreshed_session_token'] !== null && $webSessionCookie->isEnabled()) {
    $newExpiresAt = new \DateTimeImmutable('+' . $config->intWithDefault('SESSION_EXPIRY_HOURS', 24) . ' hours');
    header('Set-Cookie: ' . $webSessionCookie->issueHeader($resolution['refreshed_session_token'], $newExpiresAt), false);
}

echo json_encode($result);
