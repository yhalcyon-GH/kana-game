<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Process-level tests for server/ops/auth-readiness-check.php -- the CLI
 * preflight that actually invokes ProductionAuthReadiness (see that
 * class's own doc comment: it previously had no invocation path at all).
 * Runs the script as a real subprocess with env vars, since Config::load()
 * reads getenv() directly.
 */

/**
 * @param array<string, string> $env
 * @return array{exitCode: int, stdout: string, stderr: string}
 */
function runAuthReadinessCheck(array $env): array
{
    $script = __DIR__ . '/../../ops/auth-readiness-check.php';
    $descriptorSpec = [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open(
        [PHP_BINARY, $script],
        $descriptorSpec,
        $pipes,
        null,
        array_merge($_ENV, $env),
    );
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
function authReadinessCheckTests(): array
{
    return [
        'exits 0 and prints OK when cookie auth is off (default dev/Sandbox state)' => function () {
            $result = runAuthReadinessCheck([]);
            assertTrue($result['exitCode'] === 0, 'expected exit code 0, got ' . $result['exitCode'] . ' stderr=' . $result['stderr']);
            assertTrue(str_contains($result['stdout'], 'OK'), 'expected OK on stdout');
        },

        'exits 0 when cookie auth is on with a fully configured real mailer' => function () {
            $result = runAuthReadinessCheck([
                'WEB_SESSION_COOKIE_ENABLED' => 'true',
                'RESEND_API_KEY' => 'key',
                'MAGIC_LINK_FROM_EMAIL' => 'noreply@example.com',
                'MAGIC_LINK_FROM_NAME' => 'Tamamizu',
            ]);
            assertTrue($result['exitCode'] === 0, 'expected exit code 0, got ' . $result['exitCode'] . ' stderr=' . $result['stderr']);
        },

        'exits 1 when cookie auth is on but the mailer triplet is incomplete' => function () {
            $result = runAuthReadinessCheck([
                'WEB_SESSION_COOKIE_ENABLED' => 'true',
                'RESEND_API_KEY' => 'key',
            ]);
            assertTrue($result['exitCode'] === 1, 'expected exit code 1, got ' . $result['exitCode']);
            assertTrue(str_contains($result['stderr'], 'MISCONFIGURED'), 'expected a MISCONFIGURED message on stderr');
            assertTrue(!str_contains($result['stderr'], 'key'), 'must never print the raw secret value');
        },

        'exits 0 when DEV_HARNESS_ENABLED wins over cookie auth, even with no mailer configured' => function () {
            $result = runAuthReadinessCheck([
                'WEB_SESSION_COOKIE_ENABLED' => 'true',
                'DEV_HARNESS_ENABLED' => 'true',
            ]);
            assertTrue($result['exitCode'] === 0, 'expected exit code 0, got ' . $result['exitCode'] . ' stderr=' . $result['stderr']);
        },
    ];
}
