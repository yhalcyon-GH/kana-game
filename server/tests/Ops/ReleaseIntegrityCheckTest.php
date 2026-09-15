<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Process-level test for the non-secret CLI release fingerprint. It validates
 * only the fixed output shape, never exposing individual file hashes or paths.
 *
 * @return array{exitCode: int, stdout: string, stderr: string}
 */
function runReleaseIntegrityCheck(): array
{
    $script = __DIR__ . '/../../ops/release-integrity-check.php';
    $descriptorSpec = [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open([PHP_BINARY, $script], $descriptorSpec, $pipes);
    assertTrue(is_resource($process), 'expected proc_open to start the CLI script');
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);
    return ['exitCode' => $exitCode, 'stdout' => (string) $stdout, 'stderr' => (string) $stderr];
}

/**
 * @return array<string, callable(): void>
 */
function releaseIntegrityCheckTests(): array
{
    return [
        'prints only a stable redacted SHA-256 fingerprint' => function () {
            $result = runReleaseIntegrityCheck();
            assertTrue($result['exitCode'] === 0, 'expected exit code 0, got ' . $result['exitCode']);
            assertTrue(
                preg_match('/^releaseContentSha256=[a-f0-9]{64}\\nOK\\n$/', $result['stdout']) === 1,
                'expected only the fixed fingerprint output',
            );
            assertTrue($result['stderr'] === '', 'expected no stderr output');
        },
    ];
}
