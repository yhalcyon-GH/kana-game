<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * @param list<string> $args
 * @return array{exitCode:int,stdout:string,stderr:string}
 */
function runEphemeralCleanupCli(array $args): array
{
    $script = __DIR__ . '/../../ops/ephemeral-data-cleanup.php';
    $descriptorSpec = [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open(
        [PHP_BINARY, $script, ...$args],
        $descriptorSpec,
        $pipes,
        null,
        $_ENV,
    );
    assertTrue(is_resource($process), 'expected cleanup CLI process to start');
    $stdout = (string) stream_get_contents($pipes[1]);
    $stderr = (string) stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);

    return [
        'exitCode' => proc_close($process),
        'stdout' => $stdout,
        'stderr' => $stderr,
    ];
}

/**
 * @return array<string, callable(): void>
 */
function ephemeralDataCleanupCliTests(): array
{
    return [
        'apply is refused before DB access when the explicit human approval flag is missing' => function () {
            $result = runEphemeralCleanupCli(['--apply']);

            assertSame(2, $result['exitCode'], 'missing approval must fail closed');
            assertTrue(str_contains($result['stderr'], 'explicit human approval flag required'), 'expected approval refusal');
            assertSame('', $result['stdout'], 'refusal must not print any data');
        },

        'approval flag without apply is refused before DB access' => function () {
            $result = runEphemeralCleanupCli(['--human-approved-ephemeral-cleanup']);

            assertSame(2, $result['exitCode'], 'orphan approval flag must fail closed');
            assertTrue(str_contains($result['stderr'], 'only valid with --apply'), 'expected invalid approval-mode refusal');
        },

        'unknown arguments are refused before DB access' => function () {
            $result = runEphemeralCleanupCli(['--check', '--grace-days=0']);

            assertSame(2, $result['exitCode'], 'unknown options must fail closed');
            assertTrue(str_contains($result['stderr'], 'unknown argument'), 'expected unknown-argument refusal');
        },

        'check and apply cannot be combined' => function () {
            $result = runEphemeralCleanupCli(['--check', '--apply', '--human-approved-ephemeral-cleanup']);

            assertSame(2, $result['exitCode'], 'conflicting modes must fail closed');
            assertTrue(str_contains($result['stderr'], 'choose --check or --apply'), 'expected conflicting-mode refusal');
        },
    ];
}
