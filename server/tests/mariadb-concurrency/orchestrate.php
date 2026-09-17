<?php

declare(strict_types=1);

namespace KanaGame\Paddle\MariadbConcurrency;

/**
 * CI entrypoint for the real-MariaDB concurrency verification harness.
 * See README.md for the full design. This file:
 *
 *  1. Records SELECT VERSION() and the transaction isolation level once.
 *  2. For each scenario (A, B, C1-C4), for $iterations repetitions:
 *     resets the relevant tables, seeds starting state through the
 *     real repository/handler classes (never raw SQL fixtures), spawns
 *     that scenario's worker PROCESSES via proc_open synchronized by a
 *     Barrier, then asserts every stated invariant from a fresh
 *     verification connection.
 *  3. Prints a full, secret-free summary and exits non-zero if ANY
 *     iteration of ANY scenario violated an invariant -- never retries
 *     or silently continues past a violation; every iteration of every
 *     scenario still runs so the reproduction rate is visible.
 *
 * This file diagnoses; it never modifies runtime code, and it never
 * touches Production in any way -- see README.md and the top-level PR
 * report for what was found.
 */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/Barrier.php';
require __DIR__ . '/scenarios.php';

use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Purchase\PurchaseIntentRepository;
use PDO;

/** @var list<string> $failures Accumulated across the whole run -- never cleared mid-run. */
$GLOBALS['mariadbConcurrencyFailures'] = [];
/** @var array<string, array{pass: int, fail: int}> */
$GLOBALS['mariadbConcurrencyScenarioTally'] = [];
/**
 * Webhook response-time samples (ms), one per successfully-timed worker
 * call to PurchaseWebhookHandler::handle(), keyed by scenario. Used only
 * for the pre-Live sync-vs-async response-time investigation (see
 * docs/pre-live-launch-checklist.md item 5a) -- never affects pass/fail.
 *
 * @var array<string, list<float>>
 */
$GLOBALS['mariadbConcurrencyWebhookTimings'] = [];

function recordWebhookTimings(string $scenario, array $workerResults): void
{
    foreach ($workerResults as $r) {
        if (isset($r['duration_ms']) && is_numeric($r['duration_ms'])) {
            $GLOBALS['mariadbConcurrencyWebhookTimings'][$scenario][] = (float) $r['duration_ms'];
        }
    }
}

/**
 * @param list<float> $samples
 * @return array{count: int, median: float, p95: float, max: float}
 */
function summarizeTimings(array $samples): array
{
    if ($samples === []) {
        return ['count' => 0, 'median' => 0.0, 'p95' => 0.0, 'max' => 0.0];
    }
    sort($samples);
    $count = count($samples);
    $percentile = static function (array $sorted, float $p) use ($count): float {
        $index = (int) ceil($p * $count) - 1;
        $index = max(0, min($count - 1, $index));
        return $sorted[$index];
    };
    return [
        'count' => $count,
        'median' => $percentile($samples, 0.5),
        'p95' => $percentile($samples, 0.95),
        'max' => $samples[$count - 1],
    ];
}

function rawSecretToken(): string
{
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}

function resetTables(PDO $pdo): void
{
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ([
        'sessions', 'magic_link_tokens', 'dev_harness_magic_links',
        'persistent_sessions', 'email_login_challenges', 'rate_limits',
        'pending_adjustments', 'transaction_grants', 'purchase_intents',
        'payment_events', 'entitlements', 'users',
    ] as $table) {
        $pdo->exec("TRUNCATE TABLE {$table}");
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}

function makeBarrierDir(string $scenario, int $iteration): string
{
    $dir = sys_get_temp_dir() . "/mariadb-concurrency-{$scenario}-{$iteration}-" . bin2hex(random_bytes(4));
    mkdir($dir, 0700, true);
    return $dir;
}

function writeArgsFile(string $dir, int $workerId, array $args): void
{
    file_put_contents("{$dir}/args-{$workerId}.json", json_encode($args));
}

/**
 * Spawns $workerCount worker PROCESSES for $scenario, synchronizes them
 * via a Barrier, waits for all to exit, and returns each worker's
 * decoded (secret-free) result. Throws if any worker times out or
 * exits with a non-zero status without producing a result file (a
 * PHP fatal error/crash, not a normal caught exception -- those are
 * still reported cleanly by worker.php via the exception_class field).
 *
 * @return list<array<string, mixed>>
 */
function runWorkers(string $scenario, string $barrierDir, int $workerCount, float $timeoutSeconds = 20.0): array
{
    $barrier = new Barrier($barrierDir);
    $workerScript = __DIR__ . '/worker.php';

    $processes = [];
    for ($i = 0; $i < $workerCount; $i++) {
        $descriptorSpec = [
            0 => ['pipe', 'r'],
            1 => ['file', "{$barrierDir}/stdout-{$i}.log", 'w'],
            2 => ['file', "{$barrierDir}/stderr-{$i}.log", 'w'],
        ];
        $proc = proc_open(['php', $workerScript, $scenario, $barrierDir, (string) $i], $descriptorSpec, $pipes);
        if ($proc === false) {
            throw new \RuntimeException("failed to spawn worker {$i}");
        }
        fclose($pipes[0]);
        $processes[$i] = $proc;
    }

    // Blocks (in THIS orchestrator process) until every worker has
    // signaled ready, then releases them all via the "go" file.
    $barrier->waitForAllReadyThenRelease($workerCount, $timeoutSeconds);

    $deadline = microtime(true) + $timeoutSeconds;
    $running = $processes;
    while ($running !== []) {
        foreach ($running as $i => $proc) {
            $status = proc_get_status($proc);
            if (!$status['running']) {
                unset($running[$i]);
            }
        }
        if ($running === [] || microtime(true) > $deadline) {
            break;
        }
        usleep(2000);
    }
    foreach ($running as $i => $proc) {
        proc_terminate($proc);
        throw new \RuntimeException("worker {$i} did not finish within {$timeoutSeconds}s -- forcibly terminated");
    }
    foreach ($processes as $proc) {
        proc_close($proc);
    }

    $results = [];
    for ($i = 0; $i < $workerCount; $i++) {
        $resultPath = "{$barrierDir}/result-{$i}.json";
        if (!is_file($resultPath)) {
            $stderr = is_file("{$barrierDir}/stderr-{$i}.log") ? file_get_contents("{$barrierDir}/stderr-{$i}.log") : '';
            throw new \RuntimeException("worker {$i} produced no result file -- stderr: {$stderr}");
        }
        $results[$i] = json_decode(file_get_contents($resultPath), true);
    }
    return $results;
}

function cleanupBarrierDir(string $dir): void
{
    foreach (glob("{$dir}/*") as $f) {
        @unlink($f);
    }
    @rmdir($dir);
}

/**
 * Soft invariant check -- records a failure but does not throw, so a
 * single iteration's report shows EVERY violated invariant, not just
 * the first.
 */
function checkInvariant(string $scenario, int $iteration, string $description, bool $condition, array $diagnosticContext, array &$iterationFailures): void
{
    if (!$condition) {
        $iterationFailures[] = [
            'description' => $description,
            'context' => $diagnosticContext,
        ];
    }
}

function reportIterationOutcome(string $scenario, int $iteration, array $iterationFailures, array $workerResults, array $extraContext): void
{
    if ($iterationFailures === []) {
        $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario]['pass'] = ($GLOBALS['mariadbConcurrencyScenarioTally'][$scenario]['pass'] ?? 0) + 1;
        return;
    }

    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario]['fail'] = ($GLOBALS['mariadbConcurrencyScenarioTally'][$scenario]['fail'] ?? 0) + 1;

    echo "\n=== INVARIANT VIOLATION: scenario={$scenario} iteration={$iteration} ===\n";
    echo 'worker results: ' . json_encode($workerResults, JSON_PRETTY_PRINT) . "\n";
    echo 'extra context: ' . json_encode($extraContext, JSON_PRETTY_PRINT) . "\n";
    foreach ($iterationFailures as $f) {
        echo "  - {$f['description']}\n";
        echo '    context: ' . json_encode($f['context']) . "\n";
        $GLOBALS['mariadbConcurrencyFailures'][] = "{$scenario} iteration {$iteration}: {$f['description']} " . json_encode($f['context']);
    }
}

// --------------------------------------------------------------------
// Scenario A: same Magic Link token, N=3 concurrent verify() calls.
// --------------------------------------------------------------------
function runScenarioA(PDO $maintPdo, int $iterations): void
{
    $scenario = 'A';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 3;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);

        $rawToken = rawSecretToken();
        (new MagicLinkTokenRepository($maintPdo))->issue('race-a@example.invalid', $rawToken, new \DateTimeImmutable('+15 minutes'));

        $dir = makeBarrierDir($scenario, $iter);
        for ($i = 0; $i < $workerCount; $i++) {
            writeArgsFile($dir, $i, ['raw_token' => $rawToken]);
        }

        $iterationFailures = [];
        try {
            $results = runWorkers('verify', $dir, $workerCount);

            $successCount = 0;
            $exceptionWorkers = [];
            $successUserId = null;
            foreach ($results as $i => $r) {
                if ($r['success']) {
                    $successCount++;
                    $successUserId = $r['user_id'];
                }
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }

            checkInvariant($scenario, $iter, 'exactly one success', $successCount === 1, ['success_count' => $successCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception surfaced from any worker', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $userCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            $sessionCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM sessions')->fetchColumn();
            $tokenHash = hash('sha256', $rawToken);
            $tokenRow = $verifyPdo->prepare('SELECT used_at, user_id FROM magic_link_tokens WHERE token_hash = ?');
            $tokenRow->execute([$tokenHash]);
            $token = $tokenRow->fetch(PDO::FETCH_ASSOC);
            $sessionUserRow = $verifyPdo->query('SELECT user_id FROM sessions LIMIT 1')->fetch(PDO::FETCH_ASSOC);

            checkInvariant($scenario, $iter, 'users row count == 1', $userCount === 1, ['user_count' => $userCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'sessions row count == 1', $sessionCount === 1, ['session_count' => $sessionCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'token is used', $token !== false && $token['used_at'] !== null, ['token_found' => $token !== false], $iterationFailures);
            checkInvariant(
                $scenario, $iter, 'token bound user matches session user matches successful verify() user',
                $token !== false && $token['user_id'] !== null && $sessionUserRow !== false
                    && $token['user_id'] === $sessionUserRow['user_id'] && $token['user_id'] === $successUserId,
                ['token_user' => $token['user_id'] ?? null, 'session_user' => $sessionUserRow['user_id'] ?? null, 'verify_success_user' => $successUserId],
                $iterationFailures,
            );

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, []);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}

// --------------------------------------------------------------------
// Scenario B: two DISTINCT valid tokens for the SAME email, concurrent.
// --------------------------------------------------------------------
function runScenarioB(PDO $maintPdo, int $iterations): void
{
    $scenario = 'B';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 2;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);

        $rawTokenA = rawSecretToken();
        $rawTokenB = rawSecretToken();
        $tokens = new MagicLinkTokenRepository($maintPdo);
        $tokens->issue('race-b@example.invalid', $rawTokenA, new \DateTimeImmutable('+15 minutes'));
        $tokens->issue('race-b@example.invalid', $rawTokenB, new \DateTimeImmutable('+15 minutes'));

        $dir = makeBarrierDir($scenario, $iter);
        writeArgsFile($dir, 0, ['raw_token' => $rawTokenA]);
        writeArgsFile($dir, 1, ['raw_token' => $rawTokenB]);

        $iterationFailures = [];
        try {
            $results = runWorkers('verify', $dir, $workerCount);

            $bothSucceeded = $results[0]['success'] && $results[1]['success'];
            $sameUser = $bothSucceeded && $results[0]['user_id'] === $results[1]['user_id'] && $results[0]['user_id'] !== null;
            $exceptionWorkers = [];
            foreach ($results as $i => $r) {
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }

            checkInvariant($scenario, $iter, 'both verify() calls succeed', $bothSucceeded, ['results' => $results], $iterationFailures);
            checkInvariant($scenario, $iter, 'both resolve to the same user id', $sameUser, ['user_a' => $results[0]['user_id'], 'user_b' => $results[1]['user_id']], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception (TypeError/false-row/PDOException) surfaced', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $userCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            $sessionCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM sessions')->fetchColumn();
            $hashA = hash('sha256', $rawTokenA);
            $hashB = hash('sha256', $rawTokenB);
            $stmt = $verifyPdo->prepare('SELECT token_hash, used_at, user_id FROM magic_link_tokens WHERE token_hash IN (?, ?)');
            $stmt->execute([$hashA, $hashB]);
            $tokenRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $bothUsed = count($tokenRows) === 2 && $tokenRows[0]['used_at'] !== null && $tokenRows[1]['used_at'] !== null;
            $bothBoundSameUser = count($tokenRows) === 2 && $tokenRows[0]['user_id'] !== null && $tokenRows[0]['user_id'] === $tokenRows[1]['user_id'];

            checkInvariant($scenario, $iter, 'users row count == 1', $userCount === 1, ['user_count' => $userCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'sessions row count == 2', $sessionCount === 2, ['session_count' => $sessionCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'both tokens are used', $bothUsed, ['token_rows' => $tokenRows], $iterationFailures);
            checkInvariant($scenario, $iter, 'both tokens bound to the same user', $bothBoundSameUser, ['token_rows' => $tokenRows], $iterationFailures);

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, []);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}

/**
 * Shared setup for C1-C4: one user + one authenticated purchase_intent
 * (bypasses HTTP auth entirely -- PurchaseIntentRepository::create()
 * takes the user id directly, exactly like the SQLite-backed unit
 * tests do). Returns [$userId, $rawPurchaseRef].
 */
function seedUserAndIntent(PDO $pdo, string $email): array
{
    $userId = (new UserRepository($pdo))->findOrCreateByEmail($email)['id'];
    $rawRef = rawSecretToken();
    (new PurchaseIntentRepository($pdo))->create($userId, 'full_tamamizu', $rawRef, new \DateTimeImmutable('+30 minutes'));
    return [$userId, $rawRef];
}

// --------------------------------------------------------------------
// Scenario C1: same event_id, same transaction.completed payload,
// delivered concurrently (duplicate webhook redelivery race).
// --------------------------------------------------------------------
function runScenarioC1(PDO $maintPdo, int $iterations): void
{
    $scenario = 'C1';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 2;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);
        [$userId, $rawRef] = seedUserAndIntent($maintPdo, 'race-c1@example.invalid');

        $body = \KanaGame\Paddle\Tests\pwhTransactionCompletedPayload('evt_c1', 'txn_c1', $rawRef);
        $signature = \KanaGame\Paddle\Tests\pwhSign($body);

        $dir = makeBarrierDir($scenario, $iter);
        writeArgsFile($dir, 0, ['body' => $body, 'signature' => $signature]);
        writeArgsFile($dir, 1, ['body' => $body, 'signature' => $signature]);

        $iterationFailures = [];
        try {
            $results = runWorkers('webhook', $dir, $workerCount);
            recordWebhookTimings($scenario, $results);

            $processedCount = 0;
            $duplicateCount = 0;
            $exceptionWorkers = [];
            foreach ($results as $i => $r) {
                if (($r['message'] ?? '') === 'event processed: transaction.completed') {
                    $processedCount++;
                }
                if (($r['message'] ?? '') === 'duplicate event, already processed') {
                    $duplicateCount++;
                }
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }

            checkInvariant($scenario, $iter, 'exactly one worker actually processes the event (wins the claim)', $processedCount === 1, ['processed_count' => $processedCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'the other worker sees it as a duplicate', $duplicateCount === 1, ['duplicate_count' => $duplicateCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception surfaced from either worker', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $eventCount = (int) $verifyPdo->query("SELECT COUNT(*) FROM payment_events WHERE paddle_event_id = 'evt_c1'")->fetchColumn();
            $refHash = hash('sha256', $rawRef);
            $intentRow = $verifyPdo->prepare('SELECT consumed_at, paddle_transaction_id FROM purchase_intents WHERE purchase_ref_hash = ?');
            $intentRow->execute([$refHash]);
            $intent = $intentRow->fetch(PDO::FETCH_ASSOC);
            $grantCount = (int) $verifyPdo->query("SELECT COUNT(*) FROM transaction_grants WHERE paddle_transaction_id = 'txn_c1'")->fetchColumn();
            $entStmt = $verifyPdo->prepare('SELECT active FROM entitlements WHERE internal_user_id = ? AND product_key = ?');
            $entStmt->execute([$userId, 'full_tamamizu']);
            $active = $entStmt->fetchColumn();

            checkInvariant($scenario, $iter, 'payment_events has exactly one row for this event_id', $eventCount === 1, ['event_count' => $eventCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'the purchase_intent was consumed exactly once, bound to txn_c1', $intent !== false && $intent['consumed_at'] !== null && $intent['paddle_transaction_id'] === 'txn_c1', ['intent' => $intent], $iterationFailures);
            checkInvariant($scenario, $iter, 'transaction_grants has exactly one row for txn_c1', $grantCount === 1, ['grant_count' => $grantCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'entitlement is active', ((int) $active) === 1, ['active' => $active], $iterationFailures);

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, []);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}

// --------------------------------------------------------------------
// Scenario C2: different event_ids / different transaction ids, but
// the SAME purchase_ref -- two distinct transactions racing to claim
// one purchase_intent.
// --------------------------------------------------------------------
function runScenarioC2(PDO $maintPdo, int $iterations): void
{
    $scenario = 'C2';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 2;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);
        [$userId, $rawRef] = seedUserAndIntent($maintPdo, 'race-c2@example.invalid');

        $bodyA = \KanaGame\Paddle\Tests\pwhTransactionCompletedPayload('evt_c2a', 'txn_c2a', $rawRef);
        $bodyB = \KanaGame\Paddle\Tests\pwhTransactionCompletedPayload('evt_c2b', 'txn_c2b', $rawRef);

        $dir = makeBarrierDir($scenario, $iter);
        writeArgsFile($dir, 0, ['body' => $bodyA, 'signature' => \KanaGame\Paddle\Tests\pwhSign($bodyA)]);
        writeArgsFile($dir, 1, ['body' => $bodyB, 'signature' => \KanaGame\Paddle\Tests\pwhSign($bodyB)]);

        $iterationFailures = [];
        try {
            $results = runWorkers('webhook', $dir, $workerCount);
            recordWebhookTimings($scenario, $results);

            $processedCount = 0;
            $ignoredCount = 0;
            $exceptionWorkers = [];
            foreach ($results as $i => $r) {
                if (($r['message'] ?? '') === 'event processed: transaction.completed') {
                    $processedCount++;
                }
                if (($r['message'] ?? '') === 'event ignored: transaction.completed') {
                    $ignoredCount++;
                }
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }

            checkInvariant($scenario, $iter, 'exactly one transaction wins the purchase_intent (processed)', $processedCount === 1, ['processed_count' => $processedCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'the other transaction is safely ignored (loses the intent, not an error)', $ignoredCount === 1, ['ignored_count' => $ignoredCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception surfaced from either worker', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $refHash = hash('sha256', $rawRef);
            $intentRow = $verifyPdo->prepare('SELECT consumed_at, paddle_transaction_id FROM purchase_intents WHERE purchase_ref_hash = ?');
            $intentRow->execute([$refHash]);
            $intent = $intentRow->fetch(PDO::FETCH_ASSOC);
            $grantCount = (int) $verifyPdo->query("SELECT COUNT(*) FROM transaction_grants WHERE paddle_transaction_id IN ('txn_c2a', 'txn_c2b')")->fetchColumn();
            $eventCount = (int) $verifyPdo->query("SELECT COUNT(*) FROM payment_events WHERE paddle_event_id IN ('evt_c2a', 'evt_c2b')")->fetchColumn();
            $entStmt = $verifyPdo->prepare('SELECT active FROM entitlements WHERE internal_user_id = ? AND product_key = ?');
            $entStmt->execute([$userId, 'full_tamamizu']);
            $active = $entStmt->fetchColumn();

            checkInvariant($scenario, $iter, 'the intent was consumed exactly once, bound to exactly one of the two transactions', $intent !== false && $intent['consumed_at'] !== null && in_array($intent['paddle_transaction_id'], ['txn_c2a', 'txn_c2b'], true), ['intent' => $intent], $iterationFailures);
            checkInvariant($scenario, $iter, 'transaction_grants has exactly one row total across both candidate transaction ids', $grantCount === 1, ['grant_count' => $grantCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'both events were independently claimed/recorded (different event_ids)', $eventCount === 2, ['event_count' => $eventCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'entitlement is active', ((int) $active) === 1, ['active' => $active], $iterationFailures);

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, []);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}

// --------------------------------------------------------------------
// Scenario C3: two pre-existing active grants (same user/product),
// concurrent full-refund adjustments for each -- write-skew check.
// --------------------------------------------------------------------
function runScenarioC3(PDO $maintPdo, int $iterations): void
{
    $scenario = 'C3';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 2;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);

        $userId = (new UserRepository($maintPdo))->findOrCreateByEmail('race-c3@example.invalid')['id'];
        $rawRefA = rawSecretToken();
        $rawRefB = rawSecretToken();
        $intents = new PurchaseIntentRepository($maintPdo);
        $intents->create($userId, 'full_tamamizu', $rawRefA, new \DateTimeImmutable('+30 minutes'));
        $intents->create($userId, 'full_tamamizu', $rawRefB, new \DateTimeImmutable('+30 minutes'));

        // Setup runs SEQUENTIALLY through the real handler (the "正規の
        // handler flow" the task requires), on the orchestrator's own
        // maintenance connection -- only the refund phase below is
        // genuinely concurrent.
        $setupHandler = \KanaGame\Paddle\Tests\makePurchaseWebhookHandler($maintPdo);
        $bodyTxnA = \KanaGame\Paddle\Tests\pwhTransactionCompletedPayload('evt_c3_txn_a', 'txn_c3_a', $rawRefA);
        $bodyTxnB = \KanaGame\Paddle\Tests\pwhTransactionCompletedPayload('evt_c3_txn_b', 'txn_c3_b', $rawRefB);
        $setupHandler->handle($bodyTxnA, \KanaGame\Paddle\Tests\pwhSign($bodyTxnA));
        $setupHandler->handle($bodyTxnB, \KanaGame\Paddle\Tests\pwhSign($bodyTxnB));

        $entStmt = $maintPdo->prepare('SELECT active FROM entitlements WHERE internal_user_id = ? AND product_key = ?');
        $entStmt->execute([$userId, 'full_tamamizu']);
        $setupActive = (int) $entStmt->fetchColumn();
        if ($setupActive !== 1) {
            throw new \RuntimeException("scenario C3 iteration {$iter}: setup itself failed to produce an active entitlement -- aborting, this is a harness bug, not a concurrency finding");
        }

        $bodyRefundA = \KanaGame\Paddle\Tests\pwhAdjustmentPayload('evt_c3_refund_a', 'adjustment.updated', 'txn_c3_a', 'refund', 'approved', 'full');
        $bodyRefundB = \KanaGame\Paddle\Tests\pwhAdjustmentPayload('evt_c3_refund_b', 'adjustment.updated', 'txn_c3_b', 'refund', 'approved', 'full');

        $dir = makeBarrierDir($scenario, $iter);
        writeArgsFile($dir, 0, ['body' => $bodyRefundA, 'signature' => \KanaGame\Paddle\Tests\pwhSign($bodyRefundA)]);
        writeArgsFile($dir, 1, ['body' => $bodyRefundB, 'signature' => \KanaGame\Paddle\Tests\pwhSign($bodyRefundB)]);

        $iterationFailures = [];
        try {
            $results = runWorkers('webhook', $dir, $workerCount);
            recordWebhookTimings($scenario, $results);

            $bothProcessed = ($results[0]['message'] ?? '') === 'event processed: adjustment.updated'
                && ($results[1]['message'] ?? '') === 'event processed: adjustment.updated';
            $exceptionWorkers = [];
            foreach ($results as $i => $r) {
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }
            checkInvariant($scenario, $iter, 'both refunds are processed (not ignored/duplicate)', $bothProcessed, ['results' => $results], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception surfaced from either worker', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $statusA = $verifyPdo->query("SELECT status FROM transaction_grants WHERE paddle_transaction_id = 'txn_c3_a'")->fetchColumn();
            $statusB = $verifyPdo->query("SELECT status FROM transaction_grants WHERE paddle_transaction_id = 'txn_c3_b'")->fetchColumn();
            $entitlementBearingCount = (int) (function () use ($verifyPdo, $userId) {
                $stmt = $verifyPdo->prepare("SELECT COUNT(*) FROM transaction_grants WHERE user_id = ? AND product_key = 'full_tamamizu' AND status IN ('active', 'refund_pending')");
                $stmt->execute([$userId]);
                return $stmt->fetchColumn();
            })();
            $entStmt2 = $verifyPdo->prepare('SELECT active FROM entitlements WHERE internal_user_id = ? AND product_key = ?');
            $entStmt2->execute([$userId, 'full_tamamizu']);
            $finalActive = (int) $entStmt2->fetchColumn();
            $eventCount = (int) $verifyPdo->query("SELECT COUNT(*) FROM payment_events WHERE paddle_event_id IN ('evt_c3_refund_a', 'evt_c3_refund_b')")->fetchColumn();

            checkInvariant($scenario, $iter, 'grant A is refunded', $statusA === 'refunded', ['status_a' => $statusA], $iterationFailures);
            checkInvariant($scenario, $iter, 'grant B is refunded', $statusB === 'refunded', ['status_b' => $statusB], $iterationFailures);
            checkInvariant($scenario, $iter, 'zero entitlement-bearing grants remain', $entitlementBearingCount === 0, ['entitlement_bearing_count' => $entitlementBearingCount], $iterationFailures);
            checkInvariant(
                $scenario, $iter,
                'CRITICAL: entitlements.active must be false when zero entitlement-bearing grants remain (write-skew check)',
                $finalActive === 0,
                ['final_active' => $finalActive, 'status_a' => $statusA, 'status_b' => $statusB, 'entitlement_bearing_count' => $entitlementBearingCount],
                $iterationFailures,
            );
            checkInvariant($scenario, $iter, 'both refund events recorded in payment_events', $eventCount === 2, ['event_count' => $eventCount], $iterationFailures);

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, ['setup_active_before_refunds' => $setupActive]);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}

// --------------------------------------------------------------------
// Scenario C4: refund of an old grant + concurrent repurchase of the
// same user/product.
// --------------------------------------------------------------------
function runScenarioC4(PDO $maintPdo, int $iterations): void
{
    $scenario = 'C4';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 2;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);

        $userId = (new UserRepository($maintPdo))->findOrCreateByEmail('race-c4@example.invalid')['id'];
        $rawRefOld = rawSecretToken();
        $rawRefNew = rawSecretToken();
        $intents = new PurchaseIntentRepository($maintPdo);
        $intents->create($userId, 'full_tamamizu', $rawRefOld, new \DateTimeImmutable('+30 minutes'));
        $intents->create($userId, 'full_tamamizu', $rawRefNew, new \DateTimeImmutable('+30 minutes'));

        $setupHandler = \KanaGame\Paddle\Tests\makePurchaseWebhookHandler($maintPdo);
        $bodyTxnOld = \KanaGame\Paddle\Tests\pwhTransactionCompletedPayload('evt_c4_txn_old', 'txn_c4_old', $rawRefOld);
        $setupHandler->handle($bodyTxnOld, \KanaGame\Paddle\Tests\pwhSign($bodyTxnOld));

        $entStmt = $maintPdo->prepare('SELECT active FROM entitlements WHERE internal_user_id = ? AND product_key = ?');
        $entStmt->execute([$userId, 'full_tamamizu']);
        $setupActive = (int) $entStmt->fetchColumn();
        if ($setupActive !== 1) {
            throw new \RuntimeException("scenario C4 iteration {$iter}: setup itself failed to produce an active entitlement -- aborting, this is a harness bug, not a concurrency finding");
        }

        $bodyRefund = \KanaGame\Paddle\Tests\pwhAdjustmentPayload('evt_c4_refund', 'adjustment.updated', 'txn_c4_old', 'refund', 'approved', 'full');
        $bodyTxnNew = \KanaGame\Paddle\Tests\pwhTransactionCompletedPayload('evt_c4_txn_new', 'txn_c4_new', $rawRefNew);

        $dir = makeBarrierDir($scenario, $iter);
        writeArgsFile($dir, 0, ['body' => $bodyRefund, 'signature' => \KanaGame\Paddle\Tests\pwhSign($bodyRefund)]);
        writeArgsFile($dir, 1, ['body' => $bodyTxnNew, 'signature' => \KanaGame\Paddle\Tests\pwhSign($bodyTxnNew)]);

        $iterationFailures = [];
        try {
            $results = runWorkers('webhook', $dir, $workerCount);
            recordWebhookTimings($scenario, $results);

            $bothProcessed = ($results[0]['message'] ?? '') === 'event processed: adjustment.updated'
                && ($results[1]['message'] ?? '') === 'event processed: transaction.completed';
            $exceptionWorkers = [];
            foreach ($results as $i => $r) {
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }
            checkInvariant($scenario, $iter, 'both the refund and the repurchase are processed', $bothProcessed, ['results' => $results], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception surfaced from either worker', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $statusOld = $verifyPdo->query("SELECT status FROM transaction_grants WHERE paddle_transaction_id = 'txn_c4_old'")->fetchColumn();
            $newGrantCount = (int) $verifyPdo->query("SELECT COUNT(*) FROM transaction_grants WHERE paddle_transaction_id = 'txn_c4_new' AND status = 'active'")->fetchColumn();
            $entitlementBearingCount = (int) (function () use ($verifyPdo, $userId) {
                $stmt = $verifyPdo->prepare("SELECT COUNT(*) FROM transaction_grants WHERE user_id = ? AND product_key = 'full_tamamizu' AND status IN ('active', 'refund_pending')");
                $stmt->execute([$userId]);
                return $stmt->fetchColumn();
            })();
            $entStmt2 = $verifyPdo->prepare('SELECT active FROM entitlements WHERE internal_user_id = ? AND product_key = ?');
            $entStmt2->execute([$userId, 'full_tamamizu']);
            $finalActive = (int) $entStmt2->fetchColumn();

            checkInvariant($scenario, $iter, 'the old grant is refunded', $statusOld === 'refunded', ['status_old' => $statusOld], $iterationFailures);
            checkInvariant($scenario, $iter, 'the new (repurchase) grant exists and is active', $newGrantCount === 1, ['new_grant_count' => $newGrantCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'at least one entitlement-bearing grant remains', $entitlementBearingCount >= 1, ['entitlement_bearing_count' => $entitlementBearingCount], $iterationFailures);
            checkInvariant(
                $scenario, $iter,
                'entitlements.active is true regardless of commit order',
                $finalActive === 1,
                ['final_active' => $finalActive, 'status_old' => $statusOld, 'new_grant_count' => $newGrantCount, 'entitlement_bearing_count' => $entitlementBearingCount],
                $iterationFailures,
            );

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, ['setup_active_before_race' => $setupActive]);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}

// --------------------------------------------------------------------
// Scenario D: same OTP challenge + correct code, N=3 concurrent
// verifyCode() calls -- exactly one must succeed (mirrors scenario A's
// shape for Magic Link, for the OTP path).
// --------------------------------------------------------------------
function runScenarioD(PDO $maintPdo, int $iterations): void
{
    $scenario = 'D';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 3;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);

        $rawChallengeToken = rawSecretToken();
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        (new \KanaGame\Paddle\Auth\EmailLoginChallengeRepository($maintPdo))->issue(
            'race-d@example.invalid',
            $rawChallengeToken,
            $code,
            'mariadb-concurrency-login-code-pepper',
            new \DateTimeImmutable('+10 minutes'),
        );

        $dir = makeBarrierDir($scenario, $iter);
        for ($i = 0; $i < $workerCount; $i++) {
            writeArgsFile($dir, $i, ['raw_challenge_token' => $rawChallengeToken, 'code' => $code]);
        }

        $iterationFailures = [];
        try {
            $results = runWorkers('otp_verify', $dir, $workerCount);

            $successCount = 0;
            $exceptionWorkers = [];
            foreach ($results as $i => $r) {
                if ($r['success']) {
                    $successCount++;
                }
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }

            checkInvariant($scenario, $iter, 'exactly one success', $successCount === 1, ['success_count' => $successCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception surfaced from any worker', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $userCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            $persistentCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM persistent_sessions')->fetchColumn();
            $sessionCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM sessions')->fetchColumn();
            $tokenHash = hash('sha256', $rawChallengeToken);
            $challengeRow = $verifyPdo->prepare('SELECT used_at, attempts FROM email_login_challenges WHERE challenge_token_hash = ?');
            $challengeRow->execute([$tokenHash]);
            $challenge = $challengeRow->fetch(PDO::FETCH_ASSOC);

            checkInvariant($scenario, $iter, 'users row count == 1', $userCount === 1, ['user_count' => $userCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'persistent_sessions row count == 1 (exactly one successful login minted exactly one persistent session)', $persistentCount === 1, ['persistent_count' => $persistentCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'sessions row count == 1', $sessionCount === 1, ['session_count' => $sessionCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'the challenge is used', $challenge !== false && $challenge['used_at'] !== null, ['challenge_found' => $challenge !== false], $iterationFailures);

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, []);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}

// --------------------------------------------------------------------
// Scenario E: a user already at the 3-persistent-session cap, N=2
// concurrent 4th-login verifyCode() calls (two DISTINCT challenges,
// each with its own correct code) -- both logins must succeed (login is
// NEVER blocked by the cap), the active-persistent-session count must
// never exceed 3 at any settled point, and no duplicate-eviction /
// double-revoke corruption may occur under the race.
// --------------------------------------------------------------------
function runScenarioE(PDO $maintPdo, int $iterations): void
{
    $scenario = 'E';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 2;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);

        $pepper = 'mariadb-concurrency-login-code-pepper';
        $userId = (new UserRepository($maintPdo))->findOrCreateByEmail('race-e@example.invalid')['id'];
        $persistentRepo = new \KanaGame\Paddle\Auth\PersistentSessionRepository($maintPdo);
        // Seed exactly 3 pre-existing active persistent sessions (the
        // cap) through the real repository, at 3 DISTINCT last_seen_at
        // values so LRU has an unambiguous oldest row to evict.
        $seededIds = [];
        for ($s = 0; $s < 3; $s++) {
            $seededIds[] = $persistentRepo->create($userId, rawSecretToken(), new \DateTimeImmutable('+90 days'));
        }
        foreach ($seededIds as $offset => $id) {
            $maintPdo->prepare('UPDATE persistent_sessions SET last_seen_at = ? WHERE id = ?')
                ->execute([(new \DateTimeImmutable("2020-01-0" . ($offset + 1) . " 00:00:00"))->format('Y-m-d H:i:s'), $id]);
        }
        $oldestSeededId = $seededIds[0];

        $challenges = new \KanaGame\Paddle\Auth\EmailLoginChallengeRepository($maintPdo);
        $rawChallengeA = rawSecretToken();
        $rawChallengeB = rawSecretToken();
        $codeA = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $codeB = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        // Both challenges resolve to the SAME email/user -- two distinct
        // valid codes for the same user racing to be the "4th login."
        $challenges->issue('race-e@example.invalid', $rawChallengeA, $codeA, $pepper, new \DateTimeImmutable('+10 minutes'));
        $challenges->issue('race-e@example.invalid', $rawChallengeB, $codeB, $pepper, new \DateTimeImmutable('+10 minutes'));

        $dir = makeBarrierDir($scenario, $iter);
        writeArgsFile($dir, 0, ['raw_challenge_token' => $rawChallengeA, 'code' => $codeA]);
        writeArgsFile($dir, 1, ['raw_challenge_token' => $rawChallengeB, 'code' => $codeB]);

        $iterationFailures = [];
        try {
            $results = runWorkers('otp_verify', $dir, $workerCount);

            $bothSucceeded = $results[0]['success'] && $results[1]['success'];
            $exceptionWorkers = [];
            foreach ($results as $i => $r) {
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }

            checkInvariant($scenario, $iter, 'both concurrent 4th/5th-login attempts succeed -- login is never blocked by the cap', $bothSucceeded, ['results' => $results], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception surfaced from either worker', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $activeCount = (int) (function () use ($verifyPdo, $userId) {
                $stmt = $verifyPdo->prepare('SELECT COUNT(*) FROM persistent_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()');
                $stmt->execute([$userId]);
                return $stmt->fetchColumn();
            })();
            $revokedOldestRow = $verifyPdo->prepare('SELECT revoked_at FROM persistent_sessions WHERE id = ?');
            $revokedOldestRow->execute([$oldestSeededId]);
            $revokedOldest = $revokedOldestRow->fetchColumn();
            $totalEverCreated = (int) (function () use ($verifyPdo, $userId) {
                $stmt = $verifyPdo->prepare('SELECT COUNT(*) FROM persistent_sessions WHERE user_id = ?');
                $stmt->execute([$userId]);
                return $stmt->fetchColumn();
            })();
            // Both logins together attempted 2 evictions against a
            // starting count of 3 -- the CORRECT post-race active count
            // depends on ordering (each verifyCode() call independently
            // re-checks countActiveForUser() >= cap right before
            // evicting), so the invariant this scenario actually proves
            // is the SAFETY bound: active count must never exceed the
            // cap (3) at rest, and total rows created must be exactly
            // seeded(3) + this iteration's 2 new logins = 5, with the
            // difference (5 - active) all showing revoked_at set --
            // i.e. no row is ever "lost" (neither double-counted as
            // active nor silently dropped without a revoked_at stamp).
            checkInvariant($scenario, $iter, 'active persistent_sessions count for this user never exceeds the cap (3) after the race settles', $activeCount <= 3, ['active_count' => $activeCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'the originally-oldest seeded row is revoked (LRU eviction picked it, not an arbitrary row)', $revokedOldest !== null, ['revoked_oldest' => $revokedOldest], $iterationFailures);
            checkInvariant($scenario, $iter, 'exactly 5 persistent_sessions rows exist in total for this user (3 seeded + 2 new logins, none lost)', $totalEverCreated === 5, ['total_ever_created' => $totalEverCreated], $iterationFailures);

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, ['seeded_ids' => $seededIds]);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}

// ========================================================================
// Main
// ========================================================================

$iterations = 20;
$only = null; // null == all scenarios
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--iterations=')) {
        $iterations = (int) substr($arg, strlen('--iterations='));
    }
    if (str_starts_with($arg, '--only=')) {
        $only = explode(',', substr($arg, strlen('--only=')));
    }
}

$maintPdo = connectMariadbConcurrencyTestDb();

$version = $maintPdo->query('SELECT VERSION()')->fetchColumn();
// MariaDB's system variable is tx_isolation (the pre-MySQL-5.7.20 name);
// MySQL 5.7.20+/8.0 renamed it to transaction_isolation. This harness
// targets MariaDB specifically (see README.md), so tx_isolation is
// queried directly rather than guessing/falling back -- an unknown
// variable name here should fail loudly, not silently report "unknown".
$isolation = $maintPdo->query('SELECT @@tx_isolation')->fetchColumn();
echo "MariaDB VERSION(): {$version}\n";
echo "transaction_isolation: {$isolation}\n";
echo "iterations per scenario: {$iterations}\n\n";

$allScenarios = [
    'A' => fn () => runScenarioA($maintPdo, $iterations),
    'B' => fn () => runScenarioB($maintPdo, $iterations),
    'C1' => fn () => runScenarioC1($maintPdo, $iterations),
    'C2' => fn () => runScenarioC2($maintPdo, $iterations),
    'C3' => fn () => runScenarioC3($maintPdo, $iterations),
    'C4' => fn () => runScenarioC4($maintPdo, $iterations),
    'D' => fn () => runScenarioD($maintPdo, $iterations),
    'E' => fn () => runScenarioE($maintPdo, $iterations),
];

foreach ($allScenarios as $name => $runner) {
    if ($only !== null && !in_array($name, $only, true)) {
        continue;
    }
    echo "--- Running scenario {$name} ({$iterations} iterations) ---\n";
    $runner();
    $tally = $GLOBALS['mariadbConcurrencyScenarioTally'][$name] ?? ['pass' => 0, 'fail' => 0];
    echo "scenario {$name}: {$tally['pass']} passed, {$tally['fail']} failed\n\n";
}

echo "==================== SUMMARY ====================\n";
echo "MariaDB VERSION(): {$version}\n";
echo "transaction_isolation: {$isolation}\n";
foreach ($GLOBALS['mariadbConcurrencyScenarioTally'] as $name => $tally) {
    echo "scenario {$name}: {$tally['pass']} passed, {$tally['fail']} failed\n";
}

if ($GLOBALS['mariadbConcurrencyWebhookTimings'] !== []) {
    echo "\n---- Webhook response-path timing (ms, PurchaseWebhookHandler::handle() only) ----\n";
    echo "NOTE: measured in this ephemeral GitHub Actions MariaDB container, NOT Production --\n";
    echo "absolute numbers are indicative of relative margin against the 5s Paddle deadline,\n";
    echo "not a Production latency prediction. See docs/pre-live-launch-checklist.md item 5a.\n";
    foreach ($GLOBALS['mariadbConcurrencyWebhookTimings'] as $name => $samples) {
        $summary = summarizeTimings($samples);
        printf(
            "scenario %s: n=%d median=%.2fms p95=%.2fms max=%.2fms (5000ms deadline; max margin=%.1fx)\n",
            $name,
            $summary['count'],
            $summary['median'],
            $summary['p95'],
            $summary['max'],
            $summary['max'] > 0 ? 5000.0 / $summary['max'] : INF,
        );
    }
}

if ($GLOBALS['mariadbConcurrencyFailures'] !== []) {
    echo "\n" . count($GLOBALS['mariadbConcurrencyFailures']) . " total invariant violations:\n";
    foreach ($GLOBALS['mariadbConcurrencyFailures'] as $f) {
        echo "  - {$f}\n";
    }
    exit(1);
}

echo "\nAll invariants held across all iterations of all scenarios run.\n";
exit(0);
