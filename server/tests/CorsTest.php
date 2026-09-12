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
    ];
}
