<?php

declare(strict_types=1);

/**
 * Resolve the current authenticated user from a session token.
 *
 * GET /api/auth/me.php
 * Header: Authorization: Bearer <raw-session-token>
 * -> 200 {"user_id": "...", "email_normalized": "..."}
 * -> 401 {"error": "unauthorized"}
 *
 * Depends ONLY on CurrentUserService — no Magic Link/rate-limit/mail
 * infrastructure is constructed here, since none of it is needed to
 * resolve a session.
 *
 * Also uses CurrentUserService::resolveOrRefresh(): when the session
 * cookie is missing/expired but a valid, still-active remember-me
 * (persistent-session) cookie is present, this transparently mints a
 * fresh session and reissues it as a new Set-Cookie -- no user-visible
 * re-login.
 *
 * This refresh is a genuine side effect on a GET (Issue #304, disclosed
 * in PR A review and deliberately kept as-is by the PR B design doc --
 * moving it behind a POST would touch the primary session-restoration
 * path used by every authenticated page load, for a theoretical rather
 * than demonstrated CSRF/attack risk: the refresh can only fire for a
 * caller that already holds the real, HttpOnly, SameSite=Lax, host-only
 * remember cookie for this exact browser). The bounded, REST-convention
 * mitigation actually shipped: Cache-Control: no-store below, so no
 * caching intermediary (proxy, CDN edge, browser prefetch cache) can
 * ever store or replay a response that carries a session-minting
 * Set-Cookie to a different request/client.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/PersistentSessionRepository.php';
require __DIR__ . '/../src/Auth/SessionCredentialResolver.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Auth/WebSessionCookie.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
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

// A disagreeing Bearer + cookie pair is not the same as a missing
// session credential. Reject it before the remember-cookie fallback so
// this endpoint never silently authenticates through a different
// credential source than the caller supplied.
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
} catch (\Throwable $e) {
    error_log('me.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($resolution['user'] === null) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

if ($resolution['refreshed_session_token'] !== null && $webSessionCookie->isEnabled()) {
    $newExpiresAt = new \DateTimeImmutable('+' . $config->intWithDefault('SESSION_EXPIRY_HOURS', 24) . ' hours');
    header('Set-Cookie: ' . $webSessionCookie->issueHeader($resolution['refreshed_session_token'], $newExpiresAt), false);
}

echo json_encode($resolution['user']);
