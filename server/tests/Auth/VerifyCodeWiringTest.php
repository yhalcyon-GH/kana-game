<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadVerifyCodeSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/verify-code.php');
    assertTrue($source !== false, 'could not read auth/verify-code.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function verifyCodeWiringTests(): array
{
    return [
        'verify-code.php requires and imports OtpAuthService' => function () {
            $source = loadVerifyCodeSource();
            assertTrue(str_contains($source, "require __DIR__ . '/../src/Auth/OtpAuthService.php';"), 'must require OtpAuthService.php');
            assertTrue(str_contains($source, 'use KanaGame\\Paddle\\Auth\\OtpAuthService;'), 'must use OtpAuthService');
        },

        'verify-code.php rejects a cookie-mode request from a non-allowlisted Origin BEFORE consuming the code (login-CSRF defense, same posture as verify.php)' => function () {
            $source = loadVerifyCodeSource();
            $isOriginAllowedPos = strpos($source, 'isOriginAllowed');
            $verifyCodeCallPos = strpos($source, '->verifyCode(');
            assertTrue($isOriginAllowedPos !== false && $verifyCodeCallPos !== false, 'both isOriginAllowed and ->verifyCode( must be present');
            assertTrue($isOriginAllowedPos < $verifyCodeCallPos, 'the Origin check must happen before the one-time code is ever consumed');
        },

        'verify-code.php issues a second cookie for the persistent/remember credential when cookie mode is enabled' => function () {
            $source = loadVerifyCodeSource();
            assertTrue(substr_count($source, 'Set-Cookie:') >= 2, 'must issue both the session cookie and the remember cookie');
        },

        'verify-code.php never places the raw code or challenge token in a log line' => function () {
            $source = loadVerifyCodeSource();
            preg_match_all('/error_log\\(([^)]*)\\)/', $source, $matches);
            foreach ($matches[1] as $arg) {
                assertFalse(str_contains($arg, '$rawCode') || str_contains($arg, '$rawChallengeToken') || str_contains($arg, '$body'), 'error_log() must never include the raw code/challenge/body');
            }
        },

        'verify-code.php only POST is accepted' => function () {
            $source = loadVerifyCodeSource();
            assertTrue(str_contains($source, "!== 'POST'"), 'must check REQUEST_METHOD !== POST');
            assertTrue(str_contains($source, '405'), 'must respond 405 for non-POST');
        },
    ];
}
