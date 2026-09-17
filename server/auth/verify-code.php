<?php

declare(strict_types=1);

/**
 * Consume a 6-digit email OTP code and issue a session + persistent
 * ("remember this browser") credential.
 *
 * POST /api/auth/verify-code.php {"challenge": "<opaque>", "code": "123456"}
 * -> 200 {"user": {...}}  (cookie mode -- both Set-Cookie headers issued)
 * -> 200 {"session_token": "...", "persistent_token": "...", "user": {...}}  (Bearer mode)
 * -> 400 {"error": "invalid or expired code"}
 *
 * Login-CSRF defense-in-depth mirrors verify.php exactly: reject a
 * cookie-mode request from a non-allowlisted Origin BEFORE the one-time
 * code is ever consumed, so a rejected attempt never burns an attempt
 * against LOGIN_CODE_MAX_ATTEMPTS for a legitimate follow-up.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/EmailLoginChallengeRepository.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/EmailValidator.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/OtpAuthService.php';
require __DIR__ . '/../src/Auth/PersistentSessionRepository.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Auth/WebSessionCookie.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\EmailLoginChallengeRepository;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\OtpAuthService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
use KanaGame\Paddle\Auth\RateLimiter;
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

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

if ($config->get('EMAIL_CODE_AUTH_ENABLED') !== 'true') {
    http_response_code(404);
    echo json_encode(['error' => 'not found']);
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

if ($webSessionCookie->isEnabled() && !$cors->isOriginAllowed($_SERVER['HTTP_ORIGIN'] ?? null)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
$rawChallengeToken = is_array($body) ? ($body['challenge'] ?? null) : null;
$rawCode = is_array($body) ? ($body['code'] ?? null) : null;

if (!is_string($rawChallengeToken) || $rawChallengeToken === '' || !is_string($rawCode) || $rawCode === '') {
    http_response_code(400);
    echo json_encode(['error' => 'invalid or expired code']);
    exit;
}

$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
    }

    public function sendLoginCode(string $emailNormalized, string $code): void
    {
    }
};

try {
    $pdo = Db::connect($config);
    $persistentSessions = new PersistentSessionRepository($pdo);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
        $persistentSessions,
    );
    $service = new OtpAuthService(
        $pdo,
        new EmailLoginChallengeRepository($pdo),
        $persistentSessions,
        new UserRepository($pdo),
        new SessionRepository($pdo),
        new RateLimiter(
            $pdo,
            $config->require('RATE_LIMIT_PEPPER'),
            $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
            $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
            $config->intWithDefault('LOGIN_CODE_EMAIL_PER_HOUR', 3),
            $config->intWithDefault('LOGIN_CODE_IP_PER_HOUR', 10),
        ),
        $noopMailer,
        $currentUser,
        $config->require('LOGIN_CODE_PEPPER'),
        $config->intWithDefault('LOGIN_CODE_TTL_MINUTES', 10),
        $config->intWithDefault('LOGIN_CODE_MAX_ATTEMPTS', 5),
        $config->intWithDefault('PERSISTENT_LOGIN_DAYS', 90),
        $config->intWithDefault('MAX_PERSISTENT_SESSIONS', 3),
    );
    $result = $service->verifyCode($rawChallengeToken, $rawCode);
} catch (\Throwable $e) {
    error_log('verify-code.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if (!$result->success) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid or expired code']);
    exit;
}

$userPayload = [
    'user_id' => $result->user['id'],
    'email_normalized' => $result->user['email_normalized'],
];

if ($webSessionCookie->isEnabled()) {
    $sessionExpiresAt = new \DateTimeImmutable('+' . $config->intWithDefault('SESSION_EXPIRY_HOURS', 24) . ' hours');
    $persistentExpiresAt = new \DateTimeImmutable('+' . $config->intWithDefault('PERSISTENT_LOGIN_DAYS', 90) . ' days');
    header('Set-Cookie: ' . $webSessionCookie->issueHeader($result->sessionToken, $sessionExpiresAt), false);
    header('Set-Cookie: ' . $rememberCookie->issueHeader($result->persistentToken, $persistentExpiresAt), false);
    echo json_encode(['user' => $userPayload]);
    exit;
}

echo json_encode([
    'session_token' => $result->sessionToken,
    'persistent_token' => $result->persistentToken,
    'user' => $userPayload,
]);
