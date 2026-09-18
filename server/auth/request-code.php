<?php

declare(strict_types=1);

/**
 * Request a 6-digit email sign-in code.
 *
 * POST /api/auth/request-code.php {"email": "user@example.com"}
 * -> 200 {"status": "ok", "challenge": "<opaque>"}  when a code was issued
 * -> 200 {"status": "ok"}                            when it was not (malformed
 *    email or rate-limited) -- no challenge key at all, so the frontend can
 *    tell "submit a code" from "nothing to submit" without this endpoint
 *    ever exposing WHY a challenge wasn't issued (enumeration-safe, same
 *    posture as request-link.php).
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
require __DIR__ . '/../src/Auth/ResendMailer.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/DevOnly/DevHarnessLoginCodeStore.php';
require __DIR__ . '/../src/DevOnly/DevHarnessMagicLinkStore.php';
require __DIR__ . '/../src/DevOnly/DevHarnessMailer.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\EmailLoginChallengeRepository;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\OtpAuthService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\ResendMailer;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\DevOnly\DevHarnessLoginCodeStore;
use KanaGame\Paddle\DevOnly\DevHarnessMagicLinkStore;
use KanaGame\Paddle\DevOnly\DevHarnessMailer;

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

if ($config->get('EMAIL_CODE_AUTH_ENABLED') !== 'true') {
    // Feature flag off -- a GitHub-Pages-ahead-of-backend deploy, or a
    // deliberate rollback, must not have this endpoint half-work. The
    // frontend's capability check (capabilities.php, Task 11) is what
    // decides whether to show OTP UI at all; this is defense-in-depth on
    // the backend, not the primary gate.
    http_response_code(404);
    echo json_encode(['error' => 'not found']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
$rawEmailField = is_array($body) ? ($body['email'] ?? null) : null;
$rawEmail = is_string($rawEmailField) ? $rawEmailField : '';

// server/src/Auth/RateLimiter.php's IP bucket deliberately reads ONLY
// REMOTE_ADDR -- no forwarded-for style header is ever trusted absent an
// explicit trusted-proxy configuration (not present in this phase).
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

// No real Mailer implementation is wired here unless the dev-only
// harness or Resend triplet is configured -- see the mailer-selection
// block below (identical 3-way priority to request-link.php, extended
// with sendLoginCode()).
$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
    }

    public function sendLoginCode(string $emailNormalized, string $code): void
    {
    }
};

$response = ['status' => 'ok'];

try {
    $pdo = Db::connect($config);

    // Mailer selection, in priority order (see request-link.php's
    // identical block for the full rationale):
    //   1. Dev-only substitution when DEV_HARNESS_ENABLED === 'true'.
    //   2. Production Resend mailer when the full triplet is present.
    //   3. The safe no-op, logged so an unconfigured deployment is
    //      visible in observability without leaking any PII/secret.
    $resendApiKey = $config->get('RESEND_API_KEY');
    $resendFromEmail = $config->get('MAGIC_LINK_FROM_EMAIL');
    $resendFromName = $config->get('MAGIC_LINK_FROM_NAME');

    if ($config->get('DEV_HARNESS_ENABLED') === 'true') {
        $mailer = new DevHarnessMailer(
            new DevHarnessMagicLinkStore($pdo),
            new DevHarnessLoginCodeStore($pdo),
            true,
            $config->intWithDefault('MAGIC_LINK_TOKEN_EXPIRY_MINUTES', 15),
        );
    } elseif ($resendApiKey !== null && $resendFromEmail !== null && $resendFromName !== null) {
        $mailer = new ResendMailer($resendApiKey, $resendFromEmail, $resendFromName);
    } else {
        $mailer = $noopMailer;
        error_log('request-code: mailer_unconfigured');
    }

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
        $mailer,
        $currentUser,
        $config->require('LOGIN_CODE_PEPPER'),
        $config->intWithDefault('LOGIN_CODE_TTL_MINUTES', 10),
        $config->intWithDefault('LOGIN_CODE_MAX_ATTEMPTS', 5),
        $config->intWithDefault('PERSISTENT_LOGIN_DAYS', 90),
        $config->intWithDefault('MAX_PERSISTENT_SESSIONS', 3),
    );
    $result = $service->requestCode($rawEmail, $clientIp);

    if ($result->challengeToken !== null) {
        $response['challenge'] = $result->challengeToken;
    }
} catch (\Throwable $e) {
    // NEVER log $e->getMessage() -- see request-link.php's identical
    // caveat; a DB/mailer exception could itself contain the normalized
    // email or the raw code/challenge token.
    error_log('request-code.php: ' . get_class($e));
}

echo json_encode($response);
