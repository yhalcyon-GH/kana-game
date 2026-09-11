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
 * repo doesn't otherwise have -- disproportionate for one/two headers.
 * This parses the file's own source instead, directly regressing two
 * separate incidents found via live XServer black-box testing:
 *
 * 1. The success response was cache-eligible (Cache-Control: max-age=1,
 *    Expires: +1s) because this file set no Cache-Control at all,
 *    letting a short-TTL cache layer serve a stale 200 for a one-time-
 *    use magic-link URL on a second GET moments later.
 * 2. This file never applied Cors::applyHeaders() (every other browser-
 *    facing endpoint does), so a cross-origin GET from the
 *    /account-test dev frontend still reached the server and still
 *    consumed (deleted) the row, but the browser refused to let JS
 *    read the response -- indistinguishable from "no pending link" at
 *    the UI, while silently burning the one-time link.
 */
function loadEntrypointSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../dev-only/last-magic-link.php');
    assertTrue($source !== false, 'could not read dev-only/last-magic-link.php source');
    /** @var string $source */
    return $source;
}

function assertLastMagicLinkEntrypointSetsNoStore(): void
{
    $source = loadEntrypointSource();

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

function assertLastMagicLinkEntrypointUsesCors(): void
{
    $source = loadEntrypointSource();

    assertTrue(
        str_contains($source, "require __DIR__ . '/../src/Cors.php';"),
        'last-magic-link.php must require src/Cors.php',
    );
    assertTrue(
        (bool) preg_match('/new Cors\\(\\s*\\$config->allowedOrigins\\(\\)\\s*\\)/', $source),
        'last-magic-link.php must construct Cors from $config->allowedOrigins() -- never a hardcoded origin list',
    );
    assertTrue(
        (bool) preg_match('/\\$cors->applyHeaders\\(\\s*\\$_SERVER\\[\'HTTP_ORIGIN\'\\]\\s*\\?\\?\\s*null\\s*\\)/', $source),
        "last-magic-link.php must call \$cors->applyHeaders(\$_SERVER['HTTP_ORIGIN'] ?? null)",
    );
    assertFalse(
        str_contains($source, "Access-Control-Allow-Origin: *") || str_contains($source, "Access-Control-Allow-Origin: \\*"),
        'must never emit a wildcard Access-Control-Allow-Origin -- Cors::applyHeaders() already guarantees this, this guards against ever bypassing it with a raw header() call',
    );

    // applyHeaders() must run before the first response-status branch, same
    // reasoning as the no-store check above -- every status code, not only
    // the success path, needs the CORS header for a browser to read it.
    $corsCallPos = strpos($source, '$cors->applyHeaders(');
    $firstBranchPos = strpos($source, 'if (');
    assertTrue(
        $corsCallPos !== false && $firstBranchPos !== false && $corsCallPos < $firstBranchPos,
        'Cors::applyHeaders() must be called unconditionally, before the first branch, so every response status is readable cross-origin',
    );
}

function assertLastMagicLinkEntrypointDevHarnessGateUnchanged(): void
{
    $source = loadEntrypointSource();

    // The CORS/no-store fixes must not weaken this endpoint's own
    // DEV_HARNESS_ENABLED gate -- it must still be the exact string
    // comparison that defaults closed.
    assertTrue(
        str_contains($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'"),
        'the DEV_HARNESS_ENABLED gate must remain an exact-string, default-closed check',
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
        'applies Cors::applyHeaders() from $config->allowedOrigins(), never a hardcoded/wildcard origin, before any response-status branch' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointUsesCors',
        'the DEV_HARNESS_ENABLED gate is unchanged by the CORS/no-store fixes' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointDevHarnessGateUnchanged',
    ];
}
