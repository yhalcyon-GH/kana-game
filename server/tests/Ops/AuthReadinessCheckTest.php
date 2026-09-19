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
            assertTrue(str_contains($result['stdout'], 'devHarnessEnabled=false'), 'expected disabled harness status on stdout');
            assertTrue(str_contains($result['stdout'], 'OK'), 'expected OK on stdout');
        },

        'reports Email OTP as intentionally off, not misconfigured, when EMAIL_CODE_AUTH_ENABLED is unset' => function () {
            $result = runAuthReadinessCheck([]);
            assertTrue($result['exitCode'] === 0, 'expected exit code 0, got ' . $result['exitCode'] . ' stderr=' . $result['stderr']);
            assertTrue(str_contains($result['stdout'], 'emailCodeAuthEnabled=false'), 'expected the OTP feature flag status on stdout');
            assertTrue(str_contains($result['stdout'], 'loginCodePepperConfigured=false'), 'expected the pepper-presence status on stdout');
            assertTrue(str_contains($result['stdout'], 'emailCodeAuthReady=false'), 'expected the derived OTP readiness status on stdout');
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
            assertTrue(str_contains($result['stdout'], 'devHarnessEnabled=true'), 'expected enabled harness status on stdout');
        },

        'exits 1 when EMAIL_CODE_AUTH_ENABLED is on but LOGIN_CODE_PEPPER is missing' => function () {
            $result = runAuthReadinessCheck([
                'EMAIL_CODE_AUTH_ENABLED' => 'true',
            ]);
            assertTrue($result['exitCode'] === 1, 'expected exit code 1, got ' . $result['exitCode']);
            assertTrue(str_contains($result['stderr'], 'MISCONFIGURED'), 'expected a MISCONFIGURED message on stderr');
            assertTrue(str_contains($result['stderr'], 'LOGIN_CODE_PEPPER'), 'expected the error to name the missing secret');
            assertTrue(str_contains($result['stdout'], 'emailCodeAuthEnabled=true'), 'expected the OTP feature flag status on stdout even on failure');
            assertTrue(str_contains($result['stdout'], 'loginCodePepperConfigured=false'), 'expected the pepper-presence status on stdout even on failure');
            assertTrue(str_contains($result['stdout'], 'emailCodeAuthReady=false'), 'expected the derived OTP readiness status on stdout even on failure');
            assertTrue(!str_contains($result['stdout'], 'OK'), 'must not print OK when misconfigured');
        },

        'exits 0 when EMAIL_CODE_AUTH_ENABLED is on and LOGIN_CODE_PEPPER is configured (and distinct from RATE_LIMIT_PEPPER)' => function () {
            $result = runAuthReadinessCheck([
                'EMAIL_CODE_AUTH_ENABLED' => 'true',
                'LOGIN_CODE_PEPPER' => 'login-code-pepper-value',
                'RATE_LIMIT_PEPPER' => 'rate-limit-pepper-value',
            ]);
            assertTrue($result['exitCode'] === 0, 'expected exit code 0, got ' . $result['exitCode'] . ' stderr=' . $result['stderr']);
            assertTrue(str_contains($result['stdout'], 'emailCodeAuthEnabled=true'), 'expected the OTP feature flag status on stdout');
            assertTrue(str_contains($result['stdout'], 'loginCodePepperConfigured=true'), 'expected the pepper-presence status on stdout');
            assertTrue(str_contains($result['stdout'], 'emailCodeAuthReady=true'), 'expected the derived OTP readiness status on stdout');
            assertTrue(!str_contains($result['stdout'], 'login-code-pepper-value'), 'must never print the raw pepper value');
        },

        'exits 1 when LOGIN_CODE_PEPPER and RATE_LIMIT_PEPPER are set to the same value' => function () {
            $result = runAuthReadinessCheck([
                'EMAIL_CODE_AUTH_ENABLED' => 'true',
                'LOGIN_CODE_PEPPER' => 'shared-pepper-value',
                'RATE_LIMIT_PEPPER' => 'shared-pepper-value',
            ]);
            assertTrue($result['exitCode'] === 1, 'expected exit code 1, got ' . $result['exitCode']);
            assertTrue(str_contains($result['stderr'], 'MISCONFIGURED'), 'expected a MISCONFIGURED message on stderr');
            assertTrue(str_contains($result['stderr'], 'distinct'), 'expected the error to explain the peppers must be distinct');
            assertTrue(!str_contains($result['stderr'], 'shared-pepper-value'), 'must never print the raw secret value');
        },

        'exits 1 when WEB_SESSION_COOKIE_NAME and PERSISTENT_LOGIN_COOKIE_NAME are set to the same value' => function () {
            $result = runAuthReadinessCheck([
                'WEB_SESSION_COOKIE_NAME' => '__Host-shared_cookie',
                'PERSISTENT_LOGIN_COOKIE_NAME' => '__Host-shared_cookie',
            ]);
            assertTrue($result['exitCode'] === 1, 'expected exit code 1, got ' . $result['exitCode']);
            assertTrue(str_contains($result['stderr'], 'MISCONFIGURED'), 'expected a MISCONFIGURED message on stderr');
            assertTrue(str_contains($result['stderr'], 'distinct'), 'expected the error to explain the cookie names must be distinct');
        },

        'exits 0 when WEB_SESSION_COOKIE_NAME and PERSISTENT_LOGIN_COOKIE_NAME are distinct' => function () {
            $result = runAuthReadinessCheck([
                'WEB_SESSION_COOKIE_NAME' => '__Host-tamamizu_session',
                'PERSISTENT_LOGIN_COOKIE_NAME' => '__Host-tamamizu_remember',
            ]);
            assertTrue($result['exitCode'] === 0, 'expected exit code 0, got ' . $result['exitCode'] . ' stderr=' . $result['stderr']);
        },
    ];
}
