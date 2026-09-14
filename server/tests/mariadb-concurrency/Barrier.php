<?php

declare(strict_types=1);

namespace KanaGame\Paddle\MariadbConcurrency;

/**
 * A file-based ready/go barrier used to synchronize separate PHP
 * WORKER PROCESSES (never threads, never sequential calls on one
 * shared PDO -- see README.md) so each one's racy DB operation starts
 * as close to simultaneously as this mechanism can guarantee, rather
 * than relying on a guessed sleep offset.
 *
 * All state lives in plain files under one per-iteration directory
 * (created by the orchestrator, outside the repository -- see
 * orchestrate.php). Polling uses a short usleep(), never a single
 * blind sleep() for the whole wait.
 */
final class Barrier
{
    public function __construct(private readonly string $dir)
    {
    }

    /**
     * Called by a WORKER process: signals this worker is ready, then
     * blocks until the orchestrator creates the "go" file (i.e. every
     * worker has signaled ready). Throws if the wait exceeds
     * $timeoutSeconds -- a stuck barrier must fail loudly, never hang
     * a CI job indefinitely.
     */
    public function signalReadyAndWaitForGo(int $workerId, float $timeoutSeconds = 15.0): void
    {
        file_put_contents("{$this->dir}/ready-{$workerId}", '1');

        $deadline = microtime(true) + $timeoutSeconds;
        while (!is_file("{$this->dir}/go")) {
            if (microtime(true) > $deadline) {
                throw new \RuntimeException("Barrier timeout: worker {$workerId} never saw the go signal within {$timeoutSeconds}s");
            }
            usleep(500);
        }
    }

    /**
     * Called by the ORCHESTRATOR: blocks until every worker (0..$workerCount-1)
     * has signaled ready, then creates the "go" file that releases them
     * all at once.
     */
    public function waitForAllReadyThenRelease(int $workerCount, float $timeoutSeconds = 15.0): void
    {
        $deadline = microtime(true) + $timeoutSeconds;
        while (true) {
            $readyCount = 0;
            for ($i = 0; $i < $workerCount; $i++) {
                if (is_file("{$this->dir}/ready-{$i}")) {
                    $readyCount++;
                }
            }
            if ($readyCount >= $workerCount) {
                break;
            }
            if (microtime(true) > $deadline) {
                throw new \RuntimeException("Barrier timeout: only {$readyCount}/{$workerCount} workers signaled ready within {$timeoutSeconds}s");
            }
            usleep(500);
        }

        file_put_contents("{$this->dir}/go", '1');
    }
}
