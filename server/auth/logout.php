<?php

declare(strict_types=1);

/**
 * Revoke the current session.
 *
 * POST /api/auth/logout.php
 * Header: Authorization: Bearer <raw-session-token>
 * -> 200 {"status": "ok"}  -- for a MISSING token, an UNKNOWN token, or
 *    an ALREADY-REVOKED token: these are idempotent no-ops by design
 *    (SessionRepository::revoke()'s own contract), not errors.
 * -> 500 {"error": "temporary server error"} -- ONLY if an actual
 *    DB/server exception prevents the revoke attempt from completing.
 *    A genuine failure to revoke must never be reported as 200, since
 *    that would let a caller believe a session was revoked when the
 *    server never actually attempted (or failed) the revoke.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/SessionCredentialResolver.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Auth/WebSessionCookie.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionCredentialResolver;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Auth\WebSessionCookie;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

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

// CSRF defense-in-depth for the cookie transport: SameSite=Lax already
// blocks this cookie from being sent on most cross-site POSTs, but this
// must not be the ONLY defense (see docs/adr/0001-cross-site-auth-
// transport.md and the Phase 3B CORS/CSRF design) — a state-changing
// request that DID carry the session cookie must also come from an
// allowlisted Origin, or it is rejected outright, before any session
// lookup happens. A Bearer-only caller (no cookie at all) is entirely
// unaffected by this check.
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
    // No (unambiguous) token supplied at all — nothing to revoke, not
    // an error. Still clear the cookie when cookie mode is enabled:
    // idempotent, and safe even if the browser sent a stale/mismatched
    // cookie alongside a Bearer header.
    if ($webSessionCookie->isEnabled()) {
        header('Set-Cookie: ' . $webSessionCookie->deleteHeader(), false);
    }
    echo json_encode(['status' => 'ok']);
    exit;
}

try {
    $pdo = Db::connect($config);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
    );
    // SessionRepository::revoke() is itself a safe no-op for an
    // unknown/already-revoked token — if this call returns normally,
    // the revoke attempt (or no-op) is considered genuinely complete.
    // Only a THROWN exception here (a real DB failure) reaches the
    // catch block below and produces a 500.
    $currentUser->logout($rawSessionToken);
} catch (\Throwable $e) {
    error_log('logout.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($webSessionCookie->isEnabled()) {
    header('Set-Cookie: ' . $webSessionCookie->deleteHeader(), false);
}
echo json_encode(['status' => 'ok']);
