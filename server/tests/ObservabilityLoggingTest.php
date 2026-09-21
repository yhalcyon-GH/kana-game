<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/TestCase.php';

/**
 * Source-inspection regression tests for the pre-Live observability
 * hardening (stage-tagged webhook failure logging, safe outcome logging,
 * mailer_unconfigured warning, and the entitlement.php logging-convention
 * fix). Same rationale as RequestLinkMailerWiringTest.php /
 * WebSessionCookieWiringTest.php: these are plain top-level scripts with
 * real config/DB dependencies this repo's dependency-free CLI test runner
 * cannot exercise over a real HTTP+DB round trip, so the logging
 * WIRING is asserted via source text — specifically, that no call site
 * ever logs an exception message, raw payload, email, token, or other
 * request-derived free text, only fixed tags/class names.
 */
function loadSource(string $relativePath): string
{
    $source = file_get_contents(__DIR__ . '/../' . $relativePath);
    assertTrue($source !== false, "could not read {$relativePath}");
    /** @var string $source */
    return $source;
}

/**
 * Every string logged via a fixed-string error_log call in this codebase
 * must never contain any of these substrings. This is a defense-in-depth
 * regression check on the fixed tag literals themselves (not a general
 * scan of the whole file), so it stays cheap and targeted.
 */
function assertLogLiteralHasNoSensitiveMarkers(string $literal, string $message): void
{
    $forbiddenSubstrings = ['@', 'token', 'secret', 'password', 'payload'];
    foreach ($forbiddenSubstrings as $needle) {
        assertFalse(
            str_contains(strtolower($literal), $needle),
            "{$message} — logged literal must not contain '{$needle}': {$literal}",
        );
    }
}

/**
 * @return array<string, callable(): void>
 */
function observabilityLoggingTests(): array
{
    return [
        'paddle-webhook.php tags all four startup/handling stages distinctly' => function () {
            $source = loadSource('paddle-webhook.php');
            foreach (['stage=config_load', 'stage=paddle_environment', 'stage=db_connect', 'stage=handle'] as $stageTag) {
                assertTrue(
                    str_contains($source, $stageTag),
                    "expected a distinct error_log call tagged '{$stageTag}'",
                );
            }
        },

        'paddle-webhook.php never logs $e->getMessage() at any stage' => function () {
            $source = loadSource('paddle-webhook.php');
            assertFalse(
                (bool) preg_match('/error_log\([^)]*getMessage\(\)/', $source),
                'no failure path may pass $e->getMessage() into error_log — only get_class($e)',
            );
        },

        'paddle-webhook.php stage failure logs use only get_class($e), never payload/signature data' => function () {
            $source = loadSource('paddle-webhook.php');
            assertTrue(
                (bool) preg_match_all('/error_log\(\'paddle-webhook: stage=\w+ error=\' \. get_class\(\$e\)\)/', $source, $matches) && count($matches[0]) === 4,
                'expected exactly 4 stage-tagged error_log(...get_class($e)) calls',
            );
        },

        'paddle-webhook.php logs one safe outcome line per request, not the raw WebhookResult message' => function () {
            $source = loadSource('paddle-webhook.php');
            assertTrue(
                str_contains($source, 'paddle_webhook_outcome_tag($result)'),
                'expected the success path to log a classified outcome tag, not $result->message directly',
            );
            assertFalse(
                (bool) preg_match('/error_log\([^)]*\$result->message/', $source),
                '$result->message (which can embed a Paddle event-type string) must never be passed directly into error_log',
            );
        },

        'paddle-webhook.php outcome classifier maps every WebhookResult status to a fixed enum-like tag' => function () {
            $source = loadSource('paddle-webhook.php');
            foreach (['invalid_signature', 'malformed_payload', 'server_error', 'duplicate', 'ignored', 'processed', 'quarantined', 'unknown'] as $tag) {
                assertTrue(str_contains($source, "'{$tag}'"), "expected outcome classifier to produce the fixed tag '{$tag}'");
            }
        },

        'paddle-webhook.php outcome log includes the configured Paddle environment and HTTP status, no secrets' => function () {
            $source = loadSource('paddle-webhook.php');
            assertTrue(
                str_contains($source, '$environmentConfig->environment') && str_contains($source, '$result->statusCode'),
                'expected the outcome log line to carry environment (sandbox/live) and statusCode',
            );
            assertFalse(
                (bool) preg_match('/error_log\(\s*sprintf\([^;]*webhookSecret/s', $source),
                'the outcome log must never reference the webhook secret',
            );
        },

        'request-link.php logs a fixed mailer_unconfigured warning only in the no-op fallback branch' => function () {
            $source = loadSource('auth/request-link.php');
            $noopAssignPos = strpos($source, '$mailer = $noopMailer;');
            $warningPos = strpos($source, "error_log('request-link: mailer_unconfigured');");
            assertTrue($noopAssignPos !== false && $warningPos !== false, 'expected the no-op assignment and the warning to both be present');
            assertTrue($warningPos > $noopAssignPos, 'the mailer_unconfigured warning must be logged in the no-op (else) branch, not earlier');

            $devHarnessPos = strpos($source, "\$config->get('DEV_HARNESS_ENABLED') === 'true'");
            $resendPos = strpos($source, 'new ResendMailer(');
            assertTrue($devHarnessPos !== false && $devHarnessPos < $noopAssignPos, 'dev-harness branch must still be checked before the no-op/warning branch');
            assertTrue($resendPos !== false && $resendPos < $noopAssignPos, 'Resend branch must still be checked before the no-op/warning branch');
        },

        'request-link.php mailer_unconfigured warning is a fixed literal, not interpolated' => function () {
            $source = loadSource('auth/request-link.php');
            assertFalse(
                (bool) preg_match('/error_log\(\s*"[^"]*mailer_unconfigured[^"]*\$/', $source),
                'the mailer_unconfigured warning must be a fixed single-quoted literal, never a double-quoted interpolated string',
            );
        },

        'request-link.php still never logs $e->getMessage(), an email, or a token' => function () {
            $source = loadSource('auth/request-link.php');
            assertFalse(
                (bool) preg_match('/error_log\([^)]*getMessage\(\)/', $source),
                'must never pass $e->getMessage() into error_log',
            );
            assertLogLiteralHasNoSensitiveMarkers('request-link: mailer_unconfigured', 'request-link.php mailer_unconfigured tag');
        },

        'entitlement.php logs only get_class($e) on lookup failure, matching every other endpoint\'s convention' => function () {
            $source = loadSource('entitlement.php');
            assertFalse(
                (bool) preg_match('/error_log\([^)]*getMessage\(\)/', $source),
                'entitlement.php must no longer pass $e->getMessage() into error_log -- it must match the get_class($e)-only convention used by every other endpoint',
            );
            assertTrue(
                str_contains($source, "error_log('entitlement.php: lookup failure: ' . get_class(\$e));"),
                'expected the lookup-failure log to use get_class($e) only',
            );
        },

        'no touched entrypoint logs a raw magic-link token, purchase_ref, or Paddle payload variable' => function () {
            foreach (['paddle-webhook.php', 'auth/request-link.php', 'entitlement.php'] as $relativePath) {
                $source = loadSource($relativePath);
                foreach (['error_log($rawBody', 'error_log($rawEmail', 'error_log($token', 'error_log($purchaseRef'] as $forbiddenCall) {
                    assertFalse(
                        str_contains($source, $forbiddenCall),
                        "{$relativePath} must never pass {$forbiddenCall} into error_log",
                    );
                }
            }
        },
    ];
}
