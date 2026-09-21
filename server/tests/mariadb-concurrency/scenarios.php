<?php

declare(strict_types=1);

namespace KanaGame\Paddle\MariadbConcurrency;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\FakeMailer;
use KanaGame\Paddle\Auth\MagicLinkAuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\MagicLinkUrlBuilder;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Purchase\TransactionEventLockRepository;
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

    if (isset($args['delay_us']) && is_numeric($args['delay_us']) && (int) $args['delay_us'] > 0) {
        usleep((int) $args['delay_us']);
    }

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

/**
 * Scenarios D and E: a full OtpAuthService::verifyCode() call, wired
 * exactly like makeOtpAuthServiceHarness() in OtpAuthServiceTest.php
 * (reused, not duplicated), against this worker's own PDO.
 *
 * @param array{raw_challenge_token: string, code: string} $args
 * @return array{success: bool, user_id: ?string, persistent_token_hash: ?string, exception_class: ?string, sqlstate: ?string}
 */
function scenarioOtpVerify(PDO $pdo, array $args, Barrier $barrier, int $workerId): array
{
    $h = \KanaGame\Paddle\Tests\makeOtpAuthServiceHarness($pdo);

    $barrier->signalReadyAndWaitForGo($workerId);

    try {
        $result = $h['service']->verifyCode($args['raw_challenge_token'], $args['code']);

        return [
            'success' => $result->success,
            'user_id' => $result->user['id'] ?? null,
            // Never returns the raw persistent token (secret-free result
            // shape, per this file's own doc comment) -- only its hash,
            // which is enough for the orchestrator to correlate "which
            // worker's login produced which persistent_sessions row"
            // without ever writing a real credential to a CI result file.
            'persistent_token_hash' => $result->persistentToken !== null ? hash('sha256', $result->persistentToken) : null,
            'exception_class' => null,
            'sqlstate' => null,
        ];
    } catch (\Throwable $e) {
        return [
            'success' => false,
            'user_id' => null,
            'persistent_token_hash' => null,
            'exception_class' => get_class($e),
            'sqlstate' => $e instanceof \PDOException ? ($e->errorInfo[0] ?? null) : null,
        ];
    }
}

/**
 * Scenario F: N concurrent wrong-code guesses against the SAME
 * challenge, each worker calling EmailLoginChallengeRepository::
 * consumeAttempt() directly (not the full OtpAuthService::verifyCode()
 * -- consumeAttempt()'s 'reason' field, which distinguishes
 * incorrect_code from attempts_exhausted, is exactly what this
 * scenario needs to observe, and OtpVerifyResult does not surface it).
 * Every code supplied is guaranteed wrong by construction, so success
 * must always be false; what this proves is that no more than
 * maxAttempts of the N concurrent guesses are ever ACCEPTED (reason
 * incorrect_code) -- the rest must be rejected as attempts_exhausted
 * without ever being evaluated against the real code_mac, and the
 * `attempts` column must never exceed maxAttempts.
 */
function scenarioOtpAttemptRace(PDO $pdo, array $args, Barrier $barrier, int $workerId): array
{
    require_once __DIR__ . '/../../src/Auth/EmailLoginChallengeRepository.php';
    $repo = new \KanaGame\Paddle\Auth\EmailLoginChallengeRepository($pdo);

    $barrier->signalReadyAndWaitForGo($workerId);

    try {
        $result = $repo->consumeAttempt(
            $args['raw_challenge_token'],
            $args['wrong_code'],
            \KanaGame\Paddle\Tests\OTP_TEST_PEPPER,
            $args['max_attempts'],
        );

        return [
            'success' => $result->success,
            'reason' => $result->reason,
            'exception_class' => null,
            'sqlstate' => null,
        ];
    } catch (\Throwable $e) {
        return [
            'success' => false,
            'reason' => null,
            'exception_class' => get_class($e),
            'sqlstate' => $e instanceof \PDOException ? ($e->errorInfo[0] ?? null) : null,
        ];
    }
}

/**
 * Scenario G: deterministically reproduce the dangerous refresh-vs-revoke
 * interleaving identified in Security Audit #364.
 *
 * Worker "refresh" first observes an active remember credential, then pauses.
 * Worker "revoke" revokes that persistent row and sweeps its existing children.
 * The refresh worker then creates a linked child AFTER the sweep, reproducing
 * the orphaned-but-unrevoked child row the real race can leave behind.
 *
 * The security invariant under test is not "the orphan row cannot exist" --
 * it can -- but "that child can never authenticate once its persistent parent
 * is revoked/expired." SessionRepository enforces that invariant at lookup.
 *
 * @param array{
 *   action: 'refresh'|'revoke',
 *   raw_persistent_token: string,
 *   raw_child_session_token: string,
 *   user_id: string,
 *   persistent_session_id: int
 * } $args
 * @return array{action: string, saw_parent_active: bool, child_created: bool, exception_class: ?string, sqlstate: ?string}
 */
function scenarioPersistentRefreshRevoke(PDO $pdo, array $args, Barrier $barrier, int $workerId): array
{
    $persistentSessions = new PersistentSessionRepository($pdo);
    $sessions = new SessionRepository($pdo);

    $barrier->signalReadyAndWaitForGo($workerId);

    try {
        if ($args['action'] === 'refresh') {
            $parent = $persistentSessions->findActiveByRawToken($args['raw_persistent_token']);
            $sawParentActive = $parent !== null;

            // Do not rely on scheduler timing. Explicitly tell the revoke
            // worker that the stale active-parent read has happened, then
            // wait until that worker confirms parent revocation + child sweep.
            $barrier->signalPhase('parent-read');
            $barrier->waitForPhase('revoke-swept');

            if ($parent !== null) {
                $sessions->create(
                    $args['user_id'],
                    $args['raw_child_session_token'],
                    new \DateTimeImmutable('+24 hours'),
                    $args['persistent_session_id'],
                );
            }

            return [
                'action' => 'refresh',
                'saw_parent_active' => $sawParentActive,
                'child_created' => $parent !== null,
                'exception_class' => null,
                'sqlstate' => null,
            ];
        }

        if ($args['action'] === 'revoke') {
            // Wait for the refresh worker's stale active-parent read, then
            // complete revocation + child sweep before allowing child creation.
            $barrier->waitForPhase('parent-read');
            $persistentSessions->revoke($args['persistent_session_id']);
            $sessions->revokeByPersistentSessionId($args['persistent_session_id']);
            $barrier->signalPhase('revoke-swept');

            return [
                'action' => 'revoke',
                'saw_parent_active' => false,
                'child_created' => false,
                'exception_class' => null,
                'sqlstate' => null,
            ];
        }

        throw new \InvalidArgumentException('unknown persistent refresh/revoke action');
    } catch (\Throwable $e) {
        return [
            'action' => (string) ($args['action'] ?? 'unknown'),
            'saw_parent_active' => false,
            'child_created' => false,
            'exception_class' => get_class($e),
            'sqlstate' => $e instanceof \PDOException ? ($e->errorInfo[0] ?? null) : null,
        ];
    }
}

/**
 * Scenario H3: prove per-transaction event locks do not globally serialize.
 *
 * Worker "holder" locks transaction A and keeps that DB transaction open.
 * Worker "other" must then acquire transaction B's lock BEFORE holder commits.
 * If both transaction ids shared one global serialization point, holder would
 * time out waiting for "other-locked" and the scenario would fail.
 *
 * @param array{role: 'holder'|'other', txn_id: string} $args
 * @return array{success: bool, role: string, exception_class: ?string, sqlstate: ?string}
 */
function scenarioIndependentTransactionLocks(PDO $pdo, array $args, Barrier $barrier, int $workerId): array
{
    $locks = new TransactionEventLockRepository($pdo);
    $barrier->signalReadyAndWaitForGo($workerId);

    try {
        if ($args['role'] === 'holder') {
            $pdo->beginTransaction();
            $locks->lock($args['txn_id']);
            $barrier->signalPhase('holder-locked');

            // Keep transaction A's row lock open until transaction B has
            // independently acquired its own row lock.
            $barrier->waitForPhase('other-locked', 3.0);
            $pdo->commit();

            return [
                'success' => true,
                'role' => 'holder',
                'exception_class' => null,
                'sqlstate' => null,
            ];
        }

        if ($args['role'] === 'other') {
            $barrier->waitForPhase('holder-locked', 3.0);
            $pdo->beginTransaction();
            $locks->lock($args['txn_id']);
            $barrier->signalPhase('other-locked');
            $pdo->commit();

            return [
                'success' => true,
                'role' => 'other',
                'exception_class' => null,
                'sqlstate' => null,
            ];
        }

        throw new \InvalidArgumentException('unknown independent transaction lock role');
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        return [
            'success' => false,
            'role' => (string) ($args['role'] ?? 'unknown'),
            'exception_class' => get_class($e),
            'sqlstate' => $e instanceof \PDOException ? ($e->errorInfo[0] ?? null) : null,
        ];
    }
}

