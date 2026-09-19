<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Source-inspection proof that LOGIN_CODE_PEPPER and RATE_LIMIT_PEPPER
 * are wired as two genuinely distinct config reads in every endpoint
 * that constructs both a RateLimiter and an OtpAuthService -- neither
 * ever falls back to, defaults from, or is derived from the other. This
 * is the "no new pepper needed for rate limiting, but LOGIN_CODE_PEPPER
 * is a DIFFERENT secret" requirement from the design spec, checked at
 * the wiring level (the unit-level MAC-isolation proof lives in
 * EmailLoginChallengeRepositoryTest.php).
 */
function assertDistinctPepperConfigReads(string $path): void
{
    $source = file_get_contents($path);
    assertTrue($source !== false, "could not read {$path}");
    assertTrue(str_contains($source, "\$config->require('RATE_LIMIT_PEPPER')"), "{$path} must read RATE_LIMIT_PEPPER for its RateLimiter");
    assertTrue(str_contains($source, "\$config->require('LOGIN_CODE_PEPPER')"), "{$path} must read LOGIN_CODE_PEPPER for its OtpAuthService, as a SEPARATE config->require() call");
}

/**
 * @return array<string, callable(): void>
 */
function otpConfigWiringTests(): array
{
    return [
        'request-code.php reads RATE_LIMIT_PEPPER and LOGIN_CODE_PEPPER as two distinct config->require() calls' => function () {
            assertDistinctPepperConfigReads(__DIR__ . '/../../auth/request-code.php');
        },
        'verify-code.php reads RATE_LIMIT_PEPPER and LOGIN_CODE_PEPPER as two distinct config->require() calls' => function () {
            assertDistinctPepperConfigReads(__DIR__ . '/../../auth/verify-code.php');
        },
    ];
}
