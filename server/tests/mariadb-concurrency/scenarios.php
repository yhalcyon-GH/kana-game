<?php

declare(strict_types=1);

namespace KanaGame\Paddle\MariadbConcurrency;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\FakeMailer;
use KanaGame\Paddle\Auth\MagicLinkAuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\MagicLinkUrlBuilder;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use PDO;

/**
 * Every scenario (A, B, C1-C4) is one of these two generic operations,
 * run inside a dedicated worker PROCESS against that worker's own PDO
 * connection, released simultaneously by a Barrier. The orchestrator
 * builds scenario-specific args (which token, which webhook body/
 * signature) -- the operations themselves are identical to what a real
 * concurrent HTTP request would trigger, using the real, unmodified
 * production classes.
 *
 * Return shape is deliberately secret-free: booleans, ids, status
 * codes, exception classes, SQLSTATEs -- never a raw token, raw
 * purchase_ref, or session token.
 */

/**
 * Scenarios A and B: a full MagicLinkAuthService::verify() call,
 * wired exactly like makeMagicLinkAuthServiceHarness() in
 * MagicLinkAuthServiceTest.php (reused, not duplicated -- see
 * bootstrap.php), against this worker's own PDO.
 *
 * @param array{raw_token: string} $args
 * @return array{success: bool, user_id: ?string, session_created: bool, exception_class: ?string, sqlstate: ?string}
 */
function scenarioVerify(PDO $pdo, array $args, Barrier $barrier, int $workerId): array
{
    $tokens = new MagicLinkTokenRepository($pdo);
    $users = new UserRepository($pdo);
    $sessions = new SessionRepository($pdo);
    $currentUser = new CurrentUserService($users, $sessions, 24);
    $rateLimiter = new RateLimiter($pdo, 'mariadb-concurrency-test-pepper', 5, 20);
    $mailer = new FakeMailer();
    $urlBuilder = new MagicLinkUrlBuilder('https://example.invalid/kana-game/');
    $service = new MagicLinkAuthService($pdo, $tokens, $users, $rateLimiter, $mailer, $urlBuilder, $currentUser, 15);

    $barrier->signalReadyAndWaitForGo($workerId);

    try {
        $result = $service->verify($args['raw_token']);

        return [
            'success' => $result->success,
            'user_id' => $result->user['id'] ?? null,
            'session_created' => $result->sessionToken !== null,
            'exception_class' => null,
            'sqlstate' => null,
        ];
    } catch (\Throwable $e) {
        return [
            'success' => false,
            'user_id' => null,
            'session_created' => false,
            'exception_class' => get_class($e),
            'sqlstate' => $e instanceof \PDOException ? ($e->errorInfo[0] ?? null) : null,
        ];
    }
}

/**
 * Scenarios C1-C4: a full PurchaseWebhookHandler::handle() call, wired
 * exactly like makePurchaseWebhookHandler() in
 * PurchaseWebhookHandlerTest.php (reused, not duplicated -- see
 * bootstrap.php), against this worker's own PDO.
 *
 * @param array{body: string, signature: string} $args
 * @return array{status: ?int, message: ?string, exception_class: ?string, sqlstate: ?string, duration_ms: float}
 */
function scenarioWebhook(PDO $pdo, array $args, Barrier $barrier, int $workerId): array
{
    $handler = \KanaGame\Paddle\Tests\makePurchaseWebhookHandler($pdo);

    $barrier->signalReadyAndWaitForGo($workerId);

    // Timing-only instrumentation for the pre-Live sync-vs-async webhook
    // response-time investigation (see docs/pre-live-launch-checklist.md
    // item 5a). Measures ONLY the handler's own DB-bound processing time
    // (post-signature-verification and post-barrier-release), the same
    // work paddle-webhook.php does synchronously before responding to
    // Paddle. Never affects the invariant assertions above/below --
    // purely additive.
    $start = microtime(true);
    try {
        $result = $handler->handle($args['body'], $args['signature']);
        $durationMs = (microtime(true) - $start) * 1000.0;

        return [
            'status' => $result->statusCode,
            'message' => $result->message,
            'exception_class' => null,
            'sqlstate' => null,
            'duration_ms' => $durationMs,
        ];
    } catch (\Throwable $e) {
        $durationMs = (microtime(true) - $start) * 1000.0;

        return [
            'status' => null,
            'message' => null,
            'exception_class' => get_class($e),
            'sqlstate' => $e instanceof \PDOException ? ($e->errorInfo[0] ?? null) : null,
            'duration_ms' => $durationMs,
        ];
    }
}
