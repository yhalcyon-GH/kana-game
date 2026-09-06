<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

/**
 * Minimal, dependency-free test scaffolding for this PoC — no PHPUnit
 * install is required to run server/tests/run-tests.php. Deliberately
 * small: this is a proof-of-concept test harness, not a general-purpose
 * testing framework.
 */
class TestFailure extends \Exception
{
}

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new TestFailure($message);
    }
}

function assertFalse(bool $condition, string $message): void
{
    assertTrue(!$condition, $message);
}

function assertSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        $expectedStr = var_export($expected, true);
        $actualStr = var_export($actual, true);
        throw new TestFailure("{$message} — expected {$expectedStr}, got {$actualStr}");
    }
}
