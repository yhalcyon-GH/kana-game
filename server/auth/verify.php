<?php

declare(strict_types=1);

/**
 * Consume a Magic Link token and issue a session.
 *
 * POST /api/auth/verify.php {"token": "<raw-token-from-the-URL-fragment>"}
 * -> 200 {"session_token": "<raw>", "user": {"user_id": "...", "email_normalized": "..."}}
 * -> 400 {"error": "invalid or expired token"}
 *
 * The token is read from the REQUEST BODY here, never a query string —
 * see docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-
 * design.md, section 5. The frontend reads the raw token from the URL
 * fragment and strips it from history before POSTing it here.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/EmailValidator.php';
require __DIR__ . '/../src/Auth/MagicLinkAuthService.php';
require __DIR__ . '/../src/Auth/MagicLinkTokenRepository.php';
require __DIR__ . '/../src/Auth/MagicLinkUrlBuilder.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\MagicLinkAuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\MagicLinkUrlBuilder;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());

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

$body = json_decode(file_get_contents('php://input') ?: '', true);
$rawToken = is_array($body) ? ($body['token'] ?? null) : null;

if (!is_string($rawToken) || $rawToken === '') {
    http_response_code(400);
    echo json_encode(['error' => 'invalid or expired token']);
    exit;
}

$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
    }
};

try {
    $pdo = Db::connect($config);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
    );
    $service = new MagicLinkAuthService(
        $pdo,
        new MagicLinkTokenRepository($pdo),
        new UserRepository($pdo),
        new RateLimiter(
            $pdo,
            $config->require('RATE_LIMIT_PEPPER'),
            $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
            $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
        ),
        $noopMailer,
        new MagicLinkUrlBuilder($config->require('MAGIC_LINK_FRONTEND_BASE_URL')),
        $currentUser,
        $config->intWithDefault('MAGIC_LINK_TOKEN_EXPIRY_MINUTES', 15),
    );
    $result = $service->verify($rawToken);
} catch (\Throwable $e) {
    error_log('verify.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if (!$result->success) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid or expired token']);
    exit;
}

echo json_encode([
    'session_token' => $result->sessionToken,
    'user' => [
        'user_id' => $result->user['id'],
        'email_normalized' => $result->user['email_normalized'],
    ],
]);
