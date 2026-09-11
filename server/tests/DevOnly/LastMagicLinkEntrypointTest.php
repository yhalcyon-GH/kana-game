<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Static source guard for server/dev-only/last-magic-link.php. This
 * entrypoint is a plain top-level script (not a class), so it has no
 * seam for injecting a recording header() the way Cors does (see
 * CorsTest.php's own doc comment on why PHP's CLI test-runner SAPI
 * can't observe real header() calls via headers_list()). A live-HTTP
 * check would need a whole new PHP-built-in-server test harness this
 * repo doesn't otherwise have -- disproportionate for one header. This
 * parses the file's own source instead, directly regressing the actual
 * incident: a live XServer black-box test found the success response
 * cache-eligible (Cache-Control: max-age=1, Expires: +1s) because this
 * file set no Cache-Control at all, letting a short-TTL cache layer
 * serve a stale 200 for a one-time-use magic-link URL on a second GET
 * moments later.
 */
function assertLastMagicLinkEntrypointSetsNoStore(): void
{
    $source = file_get_contents(__DIR__ . '/../../dev-only/last-magic-link.php');
    assertTrue($source !== false, 'could not read dev-only/last-magic-link.php source');

    assertTrue(
        (bool) preg_match("/header\\(\\s*'Cache-Control:\\s*no-store'\\s*\\)/", $source),
        "last-magic-link.php must call header('Cache-Control: no-store')",
    );

    // Must be set before the first conditional branch (the DEV_HARNESS_ENABLED
    // check) so every response -- 403/405/400/404/500/200 alike -- carries it,
    // not only the success path.
    $noStorePos = strpos($source, "header('Cache-Control: no-store')");
    $firstBranchPos = strpos($source, 'if (');
    assertTrue(
        $noStorePos !== false && $firstBranchPos !== false && $noStorePos < $firstBranchPos,
        'Cache-Control: no-store must be set unconditionally, before the first branch, so every response status carries it',
    );
}

/**
 * @return array<string, callable(): void>
 */
function lastMagicLinkEntrypointTests(): array
{
    return [
        'sets Cache-Control: no-store unconditionally, before any response-status branch' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointSetsNoStore',
    ];
}
