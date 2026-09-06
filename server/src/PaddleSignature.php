<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Verifies Paddle webhook signatures per the current (2026-09) official
 * Paddle Billing documentation — see
 * https://developer.paddle.com/webhooks/about/signature-verification.
 *
 * Confirmed from that page (quoted in commit history / docs/paddle-webhook-poc.md):
 * - Header name: `Paddle-Signature`.
 * - Header value format: semicolon-separated `key=value` pairs, e.g.
 *   `ts=1671552777;h1=eb4d0dc8853be92b7f063b9f3ba5233eb920a09459b6e6b2c26705b4364db151`.
 *   `h1` MAY appear more than once during a secret-rotation window — any
 *   matching `h1` value must be accepted.
 * - Algorithm: HMAC-SHA256 over the literal string "{ts}:{raw_body}",
 *   keyed with the notification destination's endpoint secret
 *   (`pdl_ntfset_...`), compared against `h1` as lowercase hex.
 * - The RAW, byte-for-byte request body must be used — Paddle's own docs
 *   explicitly warn against re-serializing/re-formatting the body before
 *   verification, since that changes the signed payload. This class only
 *   ever accepts a raw string, never a decoded array, to make that
 *   mistake structurally impossible at the call site.
 * - Paddle's own SDKs default to a 5-second timestamp tolerance to guard
 *   against replay; this class defaults to the same value.
 */
final class PaddleSignature
{
    private const DEFAULT_TOLERANCE_SECONDS = 5;

    public function __construct(
        private readonly string $secretKey,
        private readonly int $toleranceSeconds = self::DEFAULT_TOLERANCE_SECONDS,
    ) {
    }

    /**
     * @param string $rawBody The exact, unmodified HTTP request body bytes.
     * @param string $signatureHeader The raw `Paddle-Signature` header value.
     */
    public function verify(string $rawBody, string $signatureHeader): bool
    {
        $parsed = $this->parseHeader($signatureHeader);
        if ($parsed === null) {
            return false;
        }
        [$timestamp, $signatures] = $parsed;

        if (!$this->isTimestampFresh($timestamp)) {
            return false;
        }

        $expected = $this->computeHmac($timestamp, $rawBody);

        foreach ($signatures as $candidate) {
            if (hash_equals($expected, $candidate)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{0:int,1:list<string>}|null [timestamp, [h1, h1, ...]]
     */
    private function parseHeader(string $header): ?array
    {
        $timestamp = null;
        $signatures = [];

        foreach (explode(';', $header) as $pair) {
            $pair = trim($pair);
            if ($pair === '') {
                continue;
            }
            $equalsPos = strpos($pair, '=');
            if ($equalsPos === false) {
                continue;
            }
            $key = substr($pair, 0, $equalsPos);
            $value = substr($pair, $equalsPos + 1);

            if ($key === 'ts') {
                if (!ctype_digit($value)) {
                    return null;
                }
                $timestamp = (int) $value;
            } elseif ($key === 'h1') {
                if ($value === '' || !ctype_xdigit($value)) {
                    return null;
                }
                $signatures[] = strtolower($value);
            }
        }

        if ($timestamp === null || $signatures === []) {
            return null;
        }

        return [$timestamp, $signatures];
    }

    private function isTimestampFresh(int $timestamp): bool
    {
        return abs(time() - $timestamp) <= $this->toleranceSeconds;
    }

    private function computeHmac(int $timestamp, string $rawBody): string
    {
        $signedPayload = $timestamp . ':' . $rawBody;
        return hash_hmac('sha256', $signedPayload, $this->secretKey);
    }
}
