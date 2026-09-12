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

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$webSessionCookie = new WebSessionCookie(
    $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true',
    $config->get('WEB_SESSION_COOKIE_NAME') ?? WebSessionCookie::DEFAULT_NAME,
);
$credential = SessionCredentialResolver::resolve(
    SessionCredentialResolver::extractBearerToken($_SERVER['HTTP_AUTHORIZATION'] ?? null),
    $webSessionCookie->readToken($_COOKIE),
);

// A missing credential and an AMBIGUOUS one (Bearer + cookie present
// and disagreeing) are both simply "not authenticated" here -- unlike
// logout.php, this is a read-only lookup with no idempotent-success
// contract to accidentally satisfy, so both collapse to the same 401.
if ($credential->token === null) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}
$rawSessionToken = $credential->token;

try {
    $pdo = Db::connect($config);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
    );
    $me = $currentUser->resolve($rawSessionToken);
} catch (\Throwable $e) {
    error_log('me.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($me === null) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

echo json_encode($me);
