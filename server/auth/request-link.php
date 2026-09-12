<?php

declare(strict_types=1);

/**
 * Request a Magic Link sign-in email.
 *
 * POST /api/auth/request-link.php {"email": "user@example.com"}
 * -> 200 {"status": "ok"}  (ALWAYS this exact response)
 *
 * Enumeration-safe by construction: identical 200/{"status":"ok"}
 * response whether the email is malformed, already registered, brand
 * new, or currently rate-limited. See MagicLinkAuthService::
 * requestLink()'s own doc comment for the mechanism. Never creates a
 * users row.
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
$rawEmailField = is_array($body) ? ($body['email'] ?? null) : null;

// A missing/non-string email is coerced to an empty string rather than
// short-circuiting here — every POST to this endpoint must still reach
// MagicLinkAuthService::requestLink() so the IP bucket is recorded
// first, even for malformed/missing-email requests. EmailValidator
// rejects an empty string just like any other malformed input, and the
// response stays the same generic 200 either way — see
// MagicLinkAuthService::requestLink()'s own doc comment.
$rawEmail = is_string($rawEmailField) ? $rawEmailField : '';

// server/src/Auth/RateLimiter.php's IP bucket deliberately reads ONLY
// REMOTE_ADDR — X-Forwarded-For is never trusted absent an explicit
// trusted-proxy configuration (not present in this phase).
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

// No real Mailer implementation exists in this PR — see
// server/src/Auth/Mailer.php's doc comment. This inline no-op keeps
// "no real mailer exists yet" visible at the one call site that
// matters, and makes this endpoint fully deployable (if email-less)
// without a real SMTP credential.
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
    $service->requestLink($rawEmail, $clientIp);
} catch (\Throwable $e) {
    // NEVER log $e->getMessage() here — a DB/mailer exception could
    // itself contain a normalized email, a magic-link URL, or a raw
    // token. Log only the endpoint name and the exception's class.
    error_log('request-link.php: ' . get_class($e));
    // Still return the generic response — an internal failure must
    // not be distinguishable from "email was fine, link was sent."
}

echo json_encode(['status' => 'ok']);
