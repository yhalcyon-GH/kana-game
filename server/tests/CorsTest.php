<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Cors;

require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/../src/Cors.php';

/**
 * @return array<string, callable(): void>
 */
function corsTests(): array
{
    return [
        'an allowlisted origin is allowed' => function () {
            $cors = new Cors(['http://localhost:5173', 'https://yhalcyon-gh.github.io']);
            assertTrue($cors->isOriginAllowed('http://localhost:5173'), 'exact allowlist match should be allowed');
            assertTrue($cors->isOriginAllowed('https://yhalcyon-gh.github.io'), 'exact allowlist match should be allowed');
        },

        'an origin not on the allowlist is rejected' => function () {
            $cors = new Cors(['http://localhost:5173']);
            assertFalse($cors->isOriginAllowed('https://evil.example.com'), 'an unlisted origin must be rejected');
        },

        'null/empty origin is never treated as allowed' => function () {
            $cors = new Cors(['http://localhost:5173']);
            assertFalse($cors->isOriginAllowed(null), 'null origin must be rejected');
            assertFalse($cors->isOriginAllowed(''), 'empty-string origin must be rejected');
        },

        'a literal "*" allowlist entry never wildcard-matches an arbitrary origin' => function () {
            // Guards against ever reintroducing a wildcard-style CORS
            // check — even if a misconfigured server somehow set
            // ALLOWED_ORIGINS=*, membership must stay an exact string
            // match, never an implicit "allow everything."
            $cors = new Cors(['*']);
            assertFalse(
                $cors->isOriginAllowed('https://evil.example.com'),
                'a literal "*" entry must not wildcard-match an arbitrary attacker origin',
            );
        },

        'origin comparison is exact, not a prefix/substring match' => function () {
            $cors = new Cors(['https://yhalcyon-gh.github.io']);
            assertFalse(
                $cors->isOriginAllowed('https://yhalcyon-gh.github.io.evil.com'),
                'a similar-looking origin must not be allowed by substring/prefix matching',
            );
        },

        'applyPreflightHeaders() emits the required method/header policy for an allowed origin' => function () {
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyPreflightHeaders('https://yhalcyon-gh.github.io');

            $joined = implode("\n", $sent);

            assertTrue(
                str_contains($joined, 'Access-Control-Allow-Origin: https://yhalcyon-gh.github.io'),
                'allowed origin should be echoed back',
            );
            assertTrue(
                str_contains($joined, 'Vary: Origin'),
                'Vary: Origin should be present',
            );
            assertTrue(
                str_contains($joined, 'Access-Control-Allow-Methods: GET, POST, OPTIONS'),
                'GET, POST, and OPTIONS must all be in Access-Control-Allow-Methods',
            );
            assertTrue(
                str_contains($joined, 'Access-Control-Allow-Headers: Content-Type, Authorization'),
                'Content-Type and Authorization must both be in Access-Control-Allow-Headers',
            );
        },

        'applyPreflightHeaders() emits nothing for a disallowed origin' => function () {
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyPreflightHeaders('https://evil.example.com');

            assertSame([], $sent, 'a disallowed origin must get no headers at all, including no preflight authorization headers');
        },

        'applyPreflightHeaders() never emits Access-Control-Allow-Credentials or a wildcard origin' => function () {
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyPreflightHeaders('https://yhalcyon-gh.github.io');

            $joined = implode("\n", $sent);
            assertFalse(
                str_contains($joined, 'Access-Control-Allow-Credentials'),
                'production cookie transport is deferred -- this header must never be emitted yet',
            );
            assertFalse(
                str_contains($joined, 'Access-Control-Allow-Origin: *'),
                'the origin must never be echoed back as a wildcard',
            );
        },

        'applyHeaders() (non-preflight) emits exactly Access-Control-Allow-Origin and Vary for an allowed origin, nothing more' => function () {
            // Regression guard: Phase 2's entitlement.php calls
            // applyHeaders(), not applyPreflightHeaders() -- this test
            // pins that the original method's output is unchanged by
            // this extension.
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyHeaders('https://yhalcyon-gh.github.io');

            assertSame(
                ['Access-Control-Allow-Origin: https://yhalcyon-gh.github.io', 'Vary: Origin'],
                $sent,
                'applyHeaders() must emit exactly these two headers, no preflight method/header policy',
            );
        },

        'applyHeaders() emits nothing for a disallowed origin' => function () {
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyHeaders('https://evil.example.com');

            assertSame([], $sent, 'a disallowed origin must get no Access-Control-Allow-Origin header at all');
        },

        'the default constructor (no injected callable) still calls PHP\'s real header() function' => function () {
            // Confirms existing Phase 2 call sites (entitlement.php),
            // which construct `new Cors($config->allowedOrigins())` with
            // no second argument, are unaffected by this extension --
            // this only asserts the call doesn't throw/error when no
            // recording closure is supplied; PHP's CLI SAPI can't
            // observe header() output directly (see the other tests'
            // injected-closure approach for that).
            $cors = new Cors(['https://yhalcyon-gh.github.io']);
            $cors->applyHeaders('https://yhalcyon-gh.github.io');
            assertTrue(true, 'constructing and calling with no injected callable must not throw');
        },
    ];
}
