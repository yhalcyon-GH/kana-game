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

        'sendMagicLink() names the official domain and anti-installer copy in text and HTML, with escaping intact' => function () {
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

            $mailer->sendMagicLink('user@example.com', 'https://app.tamamizu.giganihongo.com/#/verify?token=raw-token-value');

            assertTrue(str_contains($captured['text'], 'app.tamamizu.giganihongo.com'), 'text body must name the official domain');
            assertTrue(str_contains($captured['text'], 'does not send app installers or executable attachments'), 'text body must state Tamamizu never sends installers/attachments');
            assertTrue(str_contains($captured['html'], 'app.tamamizu.giganihongo.com'), 'HTML body must name the official domain');
            assertTrue(str_contains($captured['html'], 'does not send app installers or executable attachments'), 'HTML body must state Tamamizu never sends installers/attachments');
            // Exactly one <a> tag — the actual Magic Link — no extra links added by the anti-phishing copy.
            assertSame(1, substr_count($captured['html'], '<a '), 'HTML body must contain exactly one link: the magic link itself');
        },

        'sendMagicLink() still HTML-escapes a magic link URL containing special characters, alongside the new anti-phishing copy' => function () {
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

            $mailer->sendMagicLink('user@example.com', 'https://app.tamamizu.giganihongo.com/#/verify?token=a&b"c');

            assertTrue(str_contains($captured['html'], 'a&amp;b&quot;c'), 'the magic link href must remain HTML-escaped');
            assertFalse(str_contains($captured['html'], 'a&b"c'), 'the raw unescaped token must not appear in the HTML body');
        },

        'sendLoginCode() names the official domain and anti-installer copy in text and HTML, with escaping intact' => function () {
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

            $mailer->sendLoginCode('user@example.com', '123456');

            assertTrue(str_contains($captured['text'], 'app.tamamizu.giganihongo.com'), 'text body must name the official domain');
            assertTrue(str_contains($captured['text'], 'Enter this code only at the official Tamamizu site'), 'text body must instruct entering the code only on the official site');
            assertTrue(str_contains($captured['text'], 'does not send app installers or executable attachments'), 'text body must state Tamamizu never sends installers/attachments');
            assertTrue(str_contains($captured['html'], 'app.tamamizu.giganihongo.com'), 'HTML body must name the official domain');
            assertTrue(str_contains($captured['html'], 'Enter this code only at the official Tamamizu site'), 'HTML body must instruct entering the code only on the official site');
            assertTrue(str_contains($captured['html'], 'does not send app installers or executable attachments'), 'HTML body must state Tamamizu never sends installers/attachments');
            // No links at all in the OTP email.
            assertFalse(str_contains($captured['html'], '<a '), 'the OTP email must not contain any link');
        },

        'sendLoginCode() still HTML-escapes the code value' => function () {
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

            $mailer->sendLoginCode('user@example.com', '<script>alert(1)</script>');

            assertFalse(str_contains($captured['html'], '<script>alert(1)</script>'), 'the code must be HTML-escaped, never rendered as raw markup');
            assertTrue(str_contains($captured['html'], htmlspecialchars('<script>alert(1)</script>', ENT_QUOTES)), 'the escaped code must still appear in the HTML body');
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
