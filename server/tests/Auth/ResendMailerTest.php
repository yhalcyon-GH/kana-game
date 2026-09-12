<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\ResendMailer;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/ResendMailer.php';

/**
 * @return array<string, callable(): void>
 */
function resendMailerTests(): array
{
    return [
        'sendMagicLink() succeeds on a 2xx response, and never throws' => function () {
            $calls = [];
            $mailer = new ResendMailer(
                'test-api-key',
                'noreply@example.com',
                'Tamamizu',
                function (string $url, array $headers, string $body, int $timeout) use (&$calls) {
                    $calls[] = ['url' => $url, 'headers' => $headers, 'body' => $body, 'timeout' => $timeout];
                    return ['status' => 200, 'body' => '{"id":"fake-id"}'];
                },
            );

            $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=raw-token-value');

            assertSame(1, count($calls), 'exactly one HTTP call should be made');
            assertTrue(str_starts_with($calls[0]['url'], 'https://'), 'the API URL must be HTTPS');
        },

        'sendMagicLink() sends an Authorization: Bearer header with the API key' => function () {
            $calls = [];
            $mailer = new ResendMailer(
                'test-api-key',
                'noreply@example.com',
                'Tamamizu',
                function (string $url, array $headers, string $body, int $timeout) use (&$calls) {
                    $calls[] = $headers;
                    return ['status' => 200, 'body' => '{}'];
                },
            );

            $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=tok');

            assertTrue(in_array('Authorization: Bearer test-api-key', $calls[0], true), 'must send the API key as a Bearer token');
        },

        'sendMagicLink() includes the magic link URL in the email body (text and html)' => function () {
            $captured = null;
            $mailer = new ResendMailer(
                'test-api-key',
                'noreply@example.com',
                'Tamamizu',
                function (string $url, array $headers, string $body, int $timeout) use (&$captured) {
                    $captured = json_decode($body, true);
                    return ['status' => 200, 'body' => '{}'];
                },
            );

            $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=raw-token-value');

            assertTrue(is_array($captured), 'request body should be valid JSON');
            assertTrue(str_contains($captured['text'], 'https://example.com/#/verify?token=raw-token-value'), 'plain-text body must include the magic link');
            assertTrue(str_contains($captured['html'], 'https://example.com/#/verify?token=raw-token-value'), 'HTML body must include the magic link');
            assertSame(['user@example.com'], $captured['to'], 'must send to exactly the given recipient');
        },

        'sendMagicLink() throws on a non-2xx response, without leaking the response body or API key in the exception message' => function () {
            $mailer = new ResendMailer(
                'super-secret-api-key',
                'noreply@example.com',
                'Tamamizu',
                function (string $url, array $headers, string $body, int $timeout) {
                    return ['status' => 422, 'body' => '{"message":"invalid recipient","email":"user@example.com"}'];
                },
            );

            $threw = false;
            try {
                $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=tok');
            } catch (\RuntimeException $e) {
                $threw = true;
                assertFalse(str_contains($e->getMessage(), 'super-secret-api-key'), 'exception message must never contain the API key');
                assertFalse(str_contains($e->getMessage(), 'invalid recipient'), 'exception message must never contain the provider\'s raw response body');
                assertTrue(str_contains($e->getMessage(), '422'), 'exception message may safely include the HTTP status code');
            }
            assertTrue($threw, 'a non-2xx response must throw');
        },

        'sendMagicLink() throws on a transport-level failure (e.g. curl error simulated via the injected transport)' => function () {
            $mailer = new ResendMailer(
                'test-api-key',
                'noreply@example.com',
                'Tamamizu',
                function (string $url, array $headers, string $body, int $timeout) {
                    throw new \RuntimeException('ResendMailer: transport error (curl errno 28)');
                },
            );

            $threw = false;
            try {
                $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=tok');
            } catch (\RuntimeException) {
                $threw = true;
            }
            assertTrue($threw, 'a transport failure must propagate as an exception, never a silent success');
        },

        'sendMagicLink() passes the configured timeout through to the transport' => function () {
            $seenTimeout = null;
            $mailer = new ResendMailer(
                'test-api-key',
                'noreply@example.com',
                'Tamamizu',
                function (string $url, array $headers, string $body, int $timeout) use (&$seenTimeout) {
                    $seenTimeout = $timeout;
                    return ['status' => 200, 'body' => '{}'];
                },
                7,
            );

            $mailer->sendMagicLink('user@example.com', 'https://example.com/#/verify?token=tok');

            assertSame(7, $seenTimeout, 'the configured timeout must reach the transport call');
        },
    ];
}
