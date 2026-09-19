<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Static source guard for server/dev-only/last-login-code.php, mirroring
 * LastMagicLinkEntrypointTest.php's source-inspection pattern for
 * server/dev-only/last-magic-link.php (see that file's own doc comment
 * for why a live-HTTP check is disproportionate here: this is a plain
 * top-level script with no class-based seam for a recording header()).
 */
function loadLastLoginCodeEntrypointSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../dev-only/last-login-code.php');
    assertTrue($source !== false, 'could not read dev-only/last-login-code.php source');
    /** @var string $source */
    return $source;
}

function assertLastLoginCodeChecksDevHarnessGateFirst(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertTrue(
        str_contains($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'"),
        'the DEV_HARNESS_ENABLED gate must be an exact-string, default-closed check',
    );

    // Must be the FIRST response-status branch in the file -- no other
    // "if (" appears earlier that could let some other check run first
    // and leak information (e.g. a 400/404 body) before the harness gate
    // is enforced.
    $gatePos = strpos($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'");
    $firstBranchPos = strpos($source, 'if (');
    assertTrue(
        $gatePos !== false && $firstBranchPos !== false && $gatePos === $firstBranchPos + strlen('if ('),
        'DEV_HARNESS_ENABLED must be checked before anything else in the file (the very first "if")',
    );
}

function assertLastLoginCodeSetsNoStore(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertTrue(
        (bool) preg_match("/header\\(\\s*'Cache-Control:\\s*no-store'\\s*\\)/", $source),
        "last-login-code.php must call header('Cache-Control: no-store')",
    );

    // Must be set before the first conditional branch (the
    // DEV_HARNESS_ENABLED check) so every response -- 403/405/400/404/
    // 500/200 alike -- carries it, not only the success path.
    $noStorePos = strpos($source, "header('Cache-Control: no-store')");
    $firstBranchPos = strpos($source, 'if (');
    assertTrue(
        $noStorePos !== false && $firstBranchPos !== false && $noStorePos < $firstBranchPos,
        'Cache-Control: no-store must be set unconditionally, before the first branch, so every response status carries it',
    );
}

function assertLastLoginCodeUsesCors(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertTrue(
        str_contains($source, "require __DIR__ . '/../src/Cors.php';"),
        'last-login-code.php must require src/Cors.php',
    );
    assertTrue(
        (bool) preg_match('/new Cors\\(\\s*\\$config->allowedOrigins\\(\\)\\s*\\)/', $source),
        'last-login-code.php must construct Cors from $config->allowedOrigins() -- never a hardcoded origin list',
    );
    assertTrue(
        (bool) preg_match('/\\$cors->applyHeaders\\(\\s*\\$_SERVER\\[\'HTTP_ORIGIN\'\\]\\s*\\?\\?\\s*null\\s*\\)/', $source),
        "last-login-code.php must call \$cors->applyHeaders(\$_SERVER['HTTP_ORIGIN'] ?? null)",
    );
    assertFalse(
        str_contains($source, 'Access-Control-Allow-Origin: *') || str_contains($source, 'Access-Control-Allow-Origin: \\*'),
        'must never emit a wildcard Access-Control-Allow-Origin -- Cors::applyHeaders() already guarantees this',
    );

    $corsCallPos = strpos($source, '$cors->applyHeaders(');
    $firstBranchPos = strpos($source, 'if (');
    assertTrue(
        $corsCallPos !== false && $firstBranchPos !== false && $corsCallPos < $firstBranchPos,
        'Cors::applyHeaders() must be called unconditionally, before the first branch, so every response status is readable cross-origin',
    );
}

function assertLastLoginCodeOnlyAcceptsGet(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertTrue(str_contains($source, "!== 'GET'"), 'expected a GET method guard');
    assertTrue(str_contains($source, '405'), 'expected a 405 response for non-GET requests');
}

function assertLastLoginCodeNeverLogsTheRawCode(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    // Every error_log( call in this file must take only a fixed string
    // literal, optionally concatenated with a safe, non-secret
    // expression (get_class($e)) -- never the raw code, the email, or
    // any other request-derived variable that could carry the code.
    // This mirrors this codebase's "never log $e->getMessage()"
    // convention. Matched as a full call (not a bare [^)]* capture,
    // which would stop early at get_class($e)'s own closing paren) so
    // every occurrence of "error_log(" in the file is accounted for by
    // this one safe shape.
    $totalCalls = substr_count($source, 'error_log(');
    assertTrue($totalCalls > 0, 'expected at least one error_log() call (the 500 path)');

    $safeCalls = preg_match_all(
        '/error_log\(\s*\'[^\']*\'(?:\s*\.\s*get_class\(\$e\))?\s*\)/',
        $source,
    );
    // Every occurrence of "error_log(" must be fully accounted for by
    // the safe shape above -- if any call took a different argument
    // (e.g. $loginCode, $emailNormalized, or $e->getMessage()), the two
    // counts would diverge.
    assertSame($totalCalls, $safeCalls, 'every error_log() call must be a fixed string literal optionally concatenated with get_class($e) only -- never a variable that could carry the code or email');
}

/**
 * @return array<string, callable(): void>
 */
function lastLoginCodeEntrypointTests(): array
{
    return [
        'checks DEV_HARNESS_ENABLED before anything else in the file' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeChecksDevHarnessGateFirst',
        'sets Cache-Control: no-store unconditionally, before any response-status branch' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeSetsNoStore',
        'applies Cors::applyHeaders() from $config->allowedOrigins(), never a hardcoded/wildcard origin, before any response-status branch' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeUsesCors',
        'only accepts GET' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeOnlyAcceptsGet',
        'never logs the raw login code' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeNeverLogsTheRawCode',
    ];
}
