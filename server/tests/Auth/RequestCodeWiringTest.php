<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadRequestCodeSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/request-code.php');
    assertTrue($source !== false, 'could not read auth/request-code.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function requestCodeWiringTests(): array
{
    return [
        'request-code.php requires and imports OtpAuthService' => function () {
            $source = loadRequestCodeSource();
            assertTrue(str_contains($source, "require __DIR__ . '/../src/Auth/OtpAuthService.php';"), 'must require OtpAuthService.php');
            assertTrue(str_contains($source, 'use KanaGame\\Paddle\\Auth\\OtpAuthService;'), 'must import OtpAuthService');
        },

        'request-code.php records the client IP from REMOTE_ADDR only (never X-Forwarded-For)' => function () {
            $source = loadRequestCodeSource();
            assertTrue(str_contains($source, "\$_SERVER['REMOTE_ADDR']"), 'must read the client IP from REMOTE_ADDR');
            assertFalse(str_contains($source, 'X-Forwarded-For') || str_contains($source, 'HTTP_X_FORWARDED_FOR'), 'must never trust a forwarded-for header absent explicit trusted-proxy config');
        },

        'request-code.php always responds with status ok and only conditionally includes a challenge field' => function () {
            $source = loadRequestCodeSource();
            assertTrue(str_contains($source, "'status' => 'ok'"), "response must always include 'status' => 'ok'");
            assertTrue(str_contains($source, 'challengeToken'), 'must branch on OtpRequestResult::$challengeToken to decide whether to include the challenge key');
        },

        'request-code.php only POST is accepted' => function () {
            $source = loadRequestCodeSource();
            assertTrue(str_contains($source, "!== 'POST'"), 'must check the request method against POST');
            assertTrue(str_contains($source, '405'), 'must respond 405 for non-POST requests');
        },

        'request-code.php rejects a present non-allowlisted Origin before reading the email body' => function () {
            $source = loadRequestCodeSource();
            assertTrue(str_contains($source, '$requestOrigin = $_SERVER[\'HTTP_ORIGIN\'] ?? null;'), 'must capture the browser Origin');
            assertTrue(str_contains($source, '!$cors->isOriginAllowed($requestOrigin)'), 'must reject a present non-allowlisted Origin');
            $originPos = strpos($source, '$requestOrigin =');
            $bodyPos = strpos($source, "file_get_contents('php://input')");
            assertTrue($originPos !== false && $bodyPos !== false && $originPos < $bodyPos, 'Origin rejection must run before the email request body is read');
            assertTrue(str_contains($source, '$requestOrigin !== null && $requestOrigin !== \'\''), 'missing Origin must remain supported for direct/non-browser callers');
        },

        'request-code.php never echoes the raw request body or a code/challenge value into error_log()' => function () {
            $source = loadRequestCodeSource();
            preg_match_all('/error_log\\(([^)]*)\\)/', $source, $matches);
            foreach ($matches[1] as $arg) {
                assertFalse(str_contains($arg, '$rawEmail') || str_contains($arg, '$body'), 'error_log() calls must never include raw request content');
            }
        },
    ];
}
