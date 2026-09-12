<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Production Magic Link mailer using the Resend REST API directly over
 * cURL — no Composer dependency added (this repo has no PHP package
 * manager by design, see docs/paddle-webhook-poc.md). Constructed and
 * used ONLY when production mail config (RESEND_API_KEY,
 * MAGIC_LINK_FROM_EMAIL, MAGIC_LINK_FROM_NAME) is fully present — see
 * server/auth/request-link.php's mailer-selection wiring. A missing/
 * incomplete config never causes THIS class to be constructed at all
 * (never a broken send-and-fail-open construction) — request-link.php
 * falls back to its existing safe no-op Mailer instead.
 */
final class ResendMailer implements Mailer
{
    private const API_URL = 'https://api.resend.com/emails';

    /** @var callable(string, list<string>, string, int): array{status: int, body: string} */
    private $httpPost;

    /**
     * @param (callable(string, list<string>, string, int): array{status: int, body: string})|null $httpPost
     *   Overridable ONLY for tests — a fake/recording transport that
     *   never makes a real network call. Production code never passes
     *   this argument (defaults to a real cURL POST).
     */
    public function __construct(
        private readonly string $apiKey,
        private readonly string $fromEmail,
        private readonly string $fromName,
        ?callable $httpPost = null,
        private readonly int $timeoutSeconds = 10,
    ) {
        $this->httpPost = $httpPost ?? self::curlPost(...);
    }

    /**
     * Throws on any failure (transport error or non-2xx response) —
     * request-link.php's own catch block turns this into "logged by
     * exception CLASS ONLY, still return the generic 200" (see that
     * file's doc comment), so a send failure is never distinguishable
     * to the caller, matching the enumeration-safe contract this
     * endpoint already has. NEVER logs/throws with the raw magic-link
     * URL (which contains the raw token), the API key, or the
     * provider's raw response body — only an HTTP status code.
     */
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
        $subject = 'Your Tamamizu sign-in link';
        $text = "Sign in to Tamamizu:\n\n{$magicLinkUrl}\n\nIf you didn't request this, you can safely ignore this email.";
        $html = '<p>Sign in to Tamamizu:</p>'
            . '<p><a href="' . htmlspecialchars($magicLinkUrl, ENT_QUOTES) . '">Sign in</a></p>'
            . '<p>If you didn\'t request this, you can safely ignore this email.</p>';

        $payload = json_encode([
            'from' => sprintf('%s <%s>', $this->fromName, $this->fromEmail),
            'to' => [$emailNormalized],
            'subject' => $subject,
            'text' => $text,
            'html' => $html,
        ]);
        if ($payload === false) {
            throw new \RuntimeException('ResendMailer: failed to encode request payload');
        }

        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json',
        ];

        $result = ($this->httpPost)(self::API_URL, $headers, $payload, $this->timeoutSeconds);

        if ($result['status'] < 200 || $result['status'] >= 300) {
            throw new \RuntimeException('ResendMailer: send failed with HTTP ' . $result['status']);
        }
    }

    /**
     * @param list<string> $headers
     * @return array{status: int, body: string}
     */
    private static function curlPost(string $url, array $headers, string $body, int $timeoutSeconds): array
    {
        // Defense in depth: refuse to ever send this request (which
        // carries the Authorization header) over anything but HTTPS,
        // even though the URL is a hardcoded constant above.
        if (!str_starts_with($url, 'https://')) {
            throw new \RuntimeException('ResendMailer: refusing a non-HTTPS URL');
        }

        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('ResendMailer: could not initialize cURL');
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);

        $responseBody = curl_exec($ch);
        if ($responseBody === false) {
            $errno = curl_errno($ch);
            curl_close($ch);
            throw new \RuntimeException('ResendMailer: transport error (curl errno ' . $errno . ')');
        }

        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return ['status' => $status, 'body' => (string) $responseBody];
    }
}
