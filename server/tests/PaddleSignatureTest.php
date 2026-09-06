<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\PaddleSignature;

require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/../src/PaddleSignature.php';

/**
 * @return array<string, callable(): void>
 */
function paddleSignatureTests(): array
{
    $secret = 'test-secret-key';

    $sign = function (int $timestamp, string $body, string $secret): string {
        return hash_hmac('sha256', $timestamp . ':' . $body, $secret);
    };

    return [
        'accepts a validly signed payload with a fresh timestamp' => function () use ($secret, $sign) {
            $body = '{"event_id":"evt_1"}';
            $ts = time();
            $h1 = $sign($ts, $body, $secret);
            $verifier = new PaddleSignature($secret);

            assertTrue($verifier->verify($body, "ts={$ts};h1={$h1}"), 'valid signature should verify');
        },

        'rejects a signature computed with the wrong secret' => function () use ($sign) {
            $body = '{"event_id":"evt_1"}';
            $ts = time();
            $h1 = $sign($ts, $body, 'wrong-secret');
            $verifier = new PaddleSignature('test-secret-key');

            assertFalse($verifier->verify($body, "ts={$ts};h1={$h1}"), 'wrong-secret signature must be rejected');
        },

        'rejects a signature computed over a DIFFERENT (re-serialized) body' => function () use ($secret, $sign) {
            // Simulates the exact mistake Paddle's own docs warn against:
            // verifying against a re-encoded/reformatted body instead of
            // the exact raw bytes actually received. Uses pretty-printed
            // JSON (added whitespace) as the "re-serialized" variant,
            // since that's a realistic way a body's bytes could change
            // even when its parsed meaning doesn't (e.g. a framework
            // re-emitting JSON with different formatting options).
            $originalBody = '{"event_id":"evt_1","event_type":"transaction.completed"}';
            $reserializedBody = json_encode(json_decode($originalBody, true), JSON_PRETTY_PRINT);
            assertTrue($originalBody !== $reserializedBody, 'test setup sanity: the two bodies must actually differ in bytes');
            $ts = time();
            $h1 = $sign($ts, $originalBody, $secret);
            $verifier = new PaddleSignature($secret);

            assertFalse(
                $verifier->verify($reserializedBody, "ts={$ts};h1={$h1}"),
                'signature computed over the original raw body must not verify against a re-serialized body',
            );
        },

        'rejects a stale timestamp beyond the tolerance window' => function () use ($secret, $sign) {
            $body = '{"event_id":"evt_1"}';
            $staleTs = time() - 3600; // 1 hour old
            $h1 = $sign($staleTs, $body, $secret);
            $verifier = new PaddleSignature($secret);

            assertFalse($verifier->verify($body, "ts={$staleTs};h1={$h1}"), 'stale timestamp must be rejected (replay protection)');
        },

        'accepts a timestamp within the configured tolerance' => function () use ($secret, $sign) {
            $body = '{"event_id":"evt_1"}';
            $ts = time() - 3; // within default 5s tolerance
            $h1 = $sign($ts, $body, $secret);
            $verifier = new PaddleSignature($secret);

            assertTrue($verifier->verify($body, "ts={$ts};h1={$h1}"), 'timestamp within tolerance should verify');
        },

        'rejects a malformed header with no h1' => function () use ($secret) {
            $verifier = new PaddleSignature($secret);
            assertFalse($verifier->verify('{}', 'ts=' . time()), 'header with no h1 must be rejected');
        },

        'rejects a malformed header with no ts' => function () use ($secret) {
            $verifier = new PaddleSignature($secret);
            assertFalse($verifier->verify('{}', 'h1=abc123'), 'header with no ts must be rejected');
        },

        'rejects a completely empty signature header' => function () use ($secret) {
            $verifier = new PaddleSignature($secret);
            assertFalse($verifier->verify('{}', ''), 'empty header must be rejected');
        },

        'accepts when the correct h1 is present alongside an unrelated extra h1 (secret-rotation window)' => function () use ($secret, $sign) {
            // Paddle's docs note h1 may appear more than once during a
            // secret-rotation window — any matching value must be accepted.
            $body = '{"event_id":"evt_1"}';
            $ts = time();
            $correctH1 = $sign($ts, $body, $secret);
            $otherH1 = str_repeat('a', 64);
            $verifier = new PaddleSignature($secret);

            assertTrue(
                $verifier->verify($body, "ts={$ts};h1={$otherH1};h1={$correctH1}"),
                'a matching h1 anywhere in a multi-h1 header should verify',
            );
        },
    ];
}
