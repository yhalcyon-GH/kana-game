<?php

declare(strict_types=1);

/**
 * Revoke every OTHER persistent ("remember this browser") credential for
 * the current user, keeping only the one tied to the caller's own
 * current browser. Cascade-revokes each revoked persistent session's
 * linked normal sessions too.
 *
 * POST /api/auth/sign-out-others.php
 * -> 200 {"status": "ok", "revoked": <int>}
 * -> 401 {"error": "unauthorized"}  -- not authenticated at all
 * -> 400 {"error": "no persistent session on this browser"}  -- authenticated,
 *    but this caller's browser has no valid remember cookie, so there is no
 *    "own" persistent session to keep -- refuse rather than guess.
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
$cookieModeEnabled = $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true';
$cors = new Cors($config->allowedOrigins(), null, $cookieModeEnabled);

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
    $cookieModeEnabled,
    $config->get('WEB_SESSION_COOKIE_NAME') ?? WebSessionCookie::DEFAULT_NAME,
);
$rememberCookie = new WebSessionCookie(
    $cookieModeEnabled,
    $config->get('PERSISTENT_LOGIN_COOKIE_NAME') ?? '__Host-tamamizu_remember',
);
$cookieToken = $webSessionCookie->readToken($_COOKIE);
$rememberToken = $rememberCookie->readToken($_COOKIE);

// CSRF defense-in-depth for the cookie transport (see logout.php's
// comment on this same check for the full rationale). This endpoint
// authenticates via resolveOrRefresh(), which can succeed from the
// remember cookie ALONE (session cookie missing/expired) and then
// revokes every OTHER active persistent credential for the user --
// a state change that must be Origin-checked regardless of which of
// the two cookies is present, not just the session cookie.
if (($cookieToken !== null || $rememberToken !== null) && !$cors->isOriginAllowed($_SERVER['HTTP_ORIGIN'] ?? null)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$credential = SessionCredentialResolver::resolve(
    SessionCredentialResolver::extractBearerToken($_SERVER['HTTP_AUTHORIZATION'] ?? null),
    $cookieToken,
);

if ($credential->ambiguous) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

try {
    $pdo = Db::connect($config);
    $persistentSessions = new PersistentSessionRepository($pdo);
    $sessions = new SessionRepository($pdo);
    $currentUser = new CurrentUserService(new UserRepository($pdo), $sessions, $config->intWithDefault('SESSION_EXPIRY_HOURS', 24), $persistentSessions);

    $resolution = $currentUser->resolveOrRefresh($credential->token, $rememberToken);
    if ($resolution['user'] === null) {
        http_response_code(401);
        echo json_encode(['error' => 'unauthorized']);
        exit;
    }

    $ownPersistentSession = $rememberToken !== null ? $persistentSessions->findActiveByRawToken($rememberToken) : null;
    if ($ownPersistentSession === null) {
        http_response_code(400);
        echo json_encode(['error' => 'no persistent session on this browser']);
        exit;
    }

    // The remember credential must belong to the same account as the current
    // session. Without this check a stale remember cookie for account B could
    // be presented alongside an active session for account A and accidentally
    // drive "sign out others" against the wrong persistent-session keep id.
    if ($ownPersistentSession['user_id'] !== $resolution['user']['user_id']) {
        http_response_code(401);
        echo json_encode(['error' => 'unauthorized']);
        exit;
    }

    // resolveOrRefresh() may have minted a fresh normal session from the
    // remember credential. Preserve exactly the token that authenticated this
    // request; every other normal session for the user (including unlinked
    // Magic-Link sessions) is revoked below.
    $currentSessionRawToken = $resolution['refreshed_session_token'] ?? $credential->token;
    if (!is_string($currentSessionRawToken) || $currentSessionRawToken === '') {
        http_response_code(401);
        echo json_encode(['error' => 'unauthorized']);
        exit;
    }

    $revokedIds = $persistentSessions->revokeAllForUserExcept($resolution['user']['user_id'], $ownPersistentSession['id']);
    foreach ($revokedIds as $revokedId) {
        $sessions->revokeByPersistentSessionId($revokedId);
    }

    $revokedSessionCount = $sessions->revokeAllForUserExceptRawToken(
        $resolution['user']['user_id'],
        $currentSessionRawToken,
    );

    if ($resolution['refreshed_session_token'] !== null && $webSessionCookie->isEnabled()) {
        $newExpiresAt = new \DateTimeImmutable(
            '+' . $config->intWithDefault('SESSION_EXPIRY_HOURS', 24) . ' hours',
        );
        header(
            'Set-Cookie: ' . $webSessionCookie->issueHeader($resolution['refreshed_session_token'], $newExpiresAt),
            false,
        );
    }
} catch (\Throwable $e) {
    error_log('sign-out-others.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

echo json_encode([
    'status' => 'ok',
    // This remains a human-facing approximation of "other browsers": one
    // browser may have multiple historical normal sessions, so report the
    // larger of persistent credentials revoked vs normal sessions revoked.
    'revoked' => max(count($revokedIds), $revokedSessionCount),
]);
