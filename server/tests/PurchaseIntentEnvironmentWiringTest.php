<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/TestCase.php';

/**
 * Source-inspection regression test for server/purchase-intent.php's
 * Phase H2 environment-assertion wiring -- this plain top-level script
 * cannot be exercised over real HTTP by this repo's dependency-free CLI
 * test runner (see WebSessionCookieWiringTest.php's own doc comment for
 * why this pattern exists), so this proves the WIRING itself via the
 * actual source text. The DECISION logic (reject vs. create) is
 * separately, fully unit-tested against a real SQLite-backed
 * PurchaseIntentEndpoint in PurchaseIntentEndpointTest.php -- this file
 * only proves the entrypoint actually calls into that logic in the
 * right order, with PaddleEnvironmentConfig::resolve() failing closed
 * (never falling through to intent creation) when the server's own
 * PADDLE_ENVIRONMENT is missing/invalid.
 */
function purchaseIntentEnvironmentWiringTests(): array
{
    return [
        'purchase-intent.php requires PaddleEnvironmentConfig.php' => function () {
            $source = file_get_contents(__DIR__ . '/../purchase-intent.php');
            assertTrue($source !== false, 'purchase-intent.php should be readable');
            assertTrue(
                str_contains($source, "require __DIR__ . '/src/PaddleEnvironmentConfig.php';"),
                'purchase-intent.php must require PaddleEnvironmentConfig.php',
            );
        },

        'purchase-intent.php resolves PaddleEnvironmentConfig inside the same try block that guards PurchaseIntentEndpoint construction -- a resolve() failure can never fall through to intent creation' => function () {
            $source = file_get_contents(__DIR__ . '/../purchase-intent.php');
            assertTrue($source !== false, 'purchase-intent.php should be readable');

            $tryPos = strpos($source, 'try {');
            $resolvePos = strpos($source, 'PaddleEnvironmentConfig::resolve($config)');
            $endpointConstructPos = strpos($source, 'new PurchaseIntentEndpoint(');
            $catchPos = strpos($source, '} catch (\\Throwable $e) {');

            assertTrue($tryPos !== false && $resolvePos !== false && $endpointConstructPos !== false && $catchPos !== false, 'all expected wiring markers must be present');
            assertTrue($tryPos < $resolvePos, 'PaddleEnvironmentConfig::resolve() must be inside the try block');
            assertTrue($resolvePos < $endpointConstructPos, 'PaddleEnvironmentConfig::resolve() must run BEFORE PurchaseIntentEndpoint is constructed -- a fail-closed resolve() failure must never be reachable after the endpoint (and therefore intent creation) is wired up');
            assertTrue($endpointConstructPos < $catchPos, 'PurchaseIntentEndpoint construction and handle() must still be inside the same try block, so any failure there is also caught');
        },

        'purchase-intent.php never sets an HTTP 200 status code outside of $result[\'status\'] -- there is no hardcoded success path that could bypass the environment check' => function () {
            $source = file_get_contents(__DIR__ . '/../purchase-intent.php');
            assertTrue($source !== false, 'purchase-intent.php should be readable');
            assertFalse(str_contains($source, "http_response_code(200)"), 'success must only ever come from PurchaseIntentEndpoint::handle()\'s own $result[\'status\'], never a hardcoded 200');
        },

        'purchase-intent.php\'s catch block returns 500 by exception class only -- a PaddleEnvironmentConfig failure (missing/invalid server PADDLE_ENVIRONMENT) fails closed, never a default environment' => function () {
            $source = file_get_contents(__DIR__ . '/../purchase-intent.php');
            assertTrue($source !== false, 'purchase-intent.php should be readable');

            $catchBlockStart = strpos($source, '} catch (\\Throwable $e) {');
            assertTrue($catchBlockStart !== false, 'a catch block must exist');
            $catchBlock = substr($source, $catchBlockStart, 400);
            // Strip `//` line comments before checking for a leaked raw
            // message -- the block's own doc comment legitimately
            // MENTIONS $e->getMessage() while explaining not to log it;
            // only an executable use of it would be a real leak.
            $catchBlockCode = preg_replace('/\\/\\/.*$/m', '', $catchBlock);
            assertTrue($catchBlockCode !== null, 'comment-stripping regex should succeed');

            assertTrue(str_contains($catchBlock, 'http_response_code(500);'), 'the catch block must return 500');
            assertTrue(str_contains($catchBlockCode, 'get_class($e)'), 'the catch block must log only the exception class');
            assertFalse(str_contains($catchBlockCode, '$e->getMessage()'), 'the catch block must never echo/log the raw exception message in executable code');
            assertFalse(str_contains($catchBlockCode, "'sandbox'") || str_contains($catchBlockCode, "'live'"), 'the catch block must never hardcode a fallback environment value');
        },
    ];
}
