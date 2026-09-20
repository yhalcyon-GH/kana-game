<?php

declare(strict_types=1);

namespace KanaGame\Paddle\MariadbConcurrency;

/**
 * The actual separate PHP PROCESS entrypoint each worker runs as
 * (orchestrate.php spawns this via proc_open -- never calls a scenario
 * function in-process). Connects its OWN PDO (never shares one across
 * processes), reads its args from a per-iteration JSON file (never
 * argv, never stdin echoed back, so a raw token/purchase_ref never
 * appears in a CI-visible process listing or log line), synchronizes
 * at the Barrier, runs the requested scenario, and writes its
 * (secret-free) result to its own result file.
 *
 * Usage: php worker.php <scenario> <barrierDir> <workerId> <workerCount>
 */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/Barrier.php';
require __DIR__ . '/scenarios.php';

[, $scenario, $barrierDir, $workerIdRaw] = $argv;
$workerId = (int) $workerIdRaw;

$argsPath = "{$barrierDir}/args-{$workerId}.json";
$rawArgs = file_get_contents($argsPath);
if ($rawArgs === false) {
    fwrite(STDERR, "worker {$workerId}: could not read args file\n");
    exit(2);
}
/** @var array<string, mixed> $args */
$args = json_decode($rawArgs, true);
if (!is_array($args)) {
    fwrite(STDERR, "worker {$workerId}: malformed args JSON\n");
    exit(2);
}

$pdo = connectMariadbConcurrencyTestDb();
$barrier = new Barrier($barrierDir);

$result = match ($scenario) {
    'verify' => scenarioVerify($pdo, $args, $barrier, $workerId),
    'webhook' => scenarioWebhook($pdo, $args, $barrier, $workerId),
    'otp_verify' => scenarioOtpVerify($pdo, $args, $barrier, $workerId),
    'otp_attempt_race' => scenarioOtpAttemptRace($pdo, $args, $barrier, $workerId),
    'persistent_refresh_revoke' => scenarioPersistentRefreshRevoke($pdo, $args, $barrier, $workerId),
    default => ['error' => "unknown scenario: {$scenario}"],
};

file_put_contents("{$barrierDir}/result-{$workerId}.json", json_encode($result));
