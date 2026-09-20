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

    // The only branch allowed to run before the DEV_HARNESS_ENABLED gate
    // is the unauthenticated OPTIONS-preflight short-circuit (Issue
    // #360) -- it always returns a fixed 204 with no CORS headers for a
    // disallowed Origin and reveals nothing about harness/dev-only
    // state. No other "if (" may appear earlier, since that could let
    // some other check run first and leak information (e.g. a 400/404
    // body) before the harness gate is enforced.
    $gatePos = strpos($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'");
    $optionsCheckPos = strpos($source, "=== 'OPTIONS'");
    assertTrue(
        $gatePos !== false && $optionsCheckPos !== false && $optionsCheckPos < $gatePos,
        'the OPTIONS-preflight short-circuit must run before the DEV_HARNESS_ENABLED gate',
    );

    preg_match_all('/if\s*\(/', $source, $matches, PREG_OFFSET_CAPTURE);
    $branchesBeforeGate = array_filter($matches[0], static fn (array $match): bool => $match[1] < $gatePos);
    assertSame(
        1,
        count($branchesBeforeGate),
        'only the OPTIONS-preflight short-circuit may run before the DEV_HARNESS_ENABLED gate',
    );
}

function assertLastLoginCodeSetsNoStore(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertTrue(
        (bool) preg_match("/header\\(\\s*'Cache-Control:\\s*no-store'\\s*\\)/", $source),
        "last-login-code.php must call header('Cache-Control: no-store')",
    );

    // Must be set before the DEV_HARNESS_ENABLED gate (the first
    // response-status branch for a non-OPTIONS request) so every
    // response -- 403/405/415/400/404/500/200 alike -- carries it, not
    // only the success path.
    $noStorePos = strpos($source, "header('Cache-Control: no-store')");
    $gatePos = strpos($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'");
    assertTrue(
        $noStorePos !== false && $gatePos !== false && $noStorePos < $gatePos,
        'Cache-Control: no-store must be set before the DEV_HARNESS_ENABLED gate, so every response status carries it',
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
    $gatePos = strpos($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'");
    assertTrue(
        $corsCallPos !== false && $gatePos !== false && $corsCallPos < $gatePos,
        'Cors::applyHeaders() must be called before the DEV_HARNESS_ENABLED gate, so every response status is readable cross-origin',
    );
}

function assertLastLoginCodeSupportsOptionsPreflight(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertTrue(
        (bool) preg_match(
            "/if\\s*\\(\\s*\\(\\\$_SERVER\\['REQUEST_METHOD'\\]\\s*\\?\\?\\s*''\\)\\s*===\\s*'OPTIONS'\\s*\\)/",
            $source,
        ),
        'expected an OPTIONS method guard',
    );
    assertTrue(
        str_contains($source, '$cors->applyPreflightHeaders('),
        'the OPTIONS branch must answer the preflight via Cors::applyPreflightHeaders(), the existing exact-origin CORS helper',
    );
    assertTrue(
        str_contains($source, 'http_response_code(204);'),
        'the OPTIONS branch must respond 204',
    );
}

function assertLastLoginCodeOnlyAcceptsPost(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertFalse(str_contains($source, "!== 'GET'"), 'GET must no longer be accepted (Issue #360)');
    assertTrue(str_contains($source, "!== 'POST'"), 'expected a POST method guard');
    assertTrue(str_contains($source, '405'), 'expected a 405 response for non-POST requests');
}

function assertLastLoginCodeRequiresJsonContentType(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertTrue(
        str_contains($source, "\$_SERVER['CONTENT_TYPE'] ?? ''"),
        'expected the Content-Type header to be inspected',
    );
    assertTrue(
        str_contains($source, '415'),
        'expected a 415 response for a non-JSON Content-Type',
    );

    $contentTypePos = strpos($source, "\$_SERVER['CONTENT_TYPE'] ?? ''");
    $bodyReadPos = strpos($source, "file_get_contents('php://input')");
    $consumePos = strpos($source, '->consume(');
    assertTrue(
        $contentTypePos !== false && $bodyReadPos !== false && $consumePos !== false
            && $contentTypePos < $bodyReadPos && $bodyReadPos < $consumePos,
        'Content-Type must be validated before the body is read, and before the credential is consumed',
    );
}

function assertLastLoginCodeRejectsDisallowedOriginBeforeConsuming(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertTrue(
        (bool) preg_match('/\\$cors->isOriginAllowed\\(\\s*\\$requestOrigin\\s*\\)/', $source),
        'expected a present Origin to be checked against Cors::isOriginAllowed()',
    );
    assertTrue(str_contains($source, '403'), 'expected a 403 response for a disallowed Origin');

    assertTrue(
        (bool) preg_match('/\\$requestOrigin\\s*!==\\s*null\\s*&&\\s*\\$requestOrigin\\s*!==\\s*\'\'/', $source),
        'a present-but-empty/null Origin must not be rejected -- only an explicitly disallowed one',
    );

    $originCheckPos = strpos($source, '$cors->isOriginAllowed(');
    $bodyReadPos = strpos($source, "file_get_contents('php://input')");
    $consumePos = strpos($source, '->consume(');
    assertTrue(
        $originCheckPos !== false && $bodyReadPos !== false && $consumePos !== false
            && $originCheckPos < $bodyReadPos && $bodyReadPos < $consumePos,
        'a disallowed Origin must be rejected before the body is read, and before the credential is consumed',
    );
}

function assertLastLoginCodeReadsEmailFromJsonBody(): void
{
    $source = loadLastLoginCodeEntrypointSource();

    assertFalse(str_contains($source, "\$_GET['email']"), 'email must no longer be read from the query string (Issue #360)');
    assertTrue(
        (bool) preg_match('/is_array\\(\\$body\\)\\s*\\?\\s*\\(\\$body\\[\'email\'\\]\\s*\\?\\?\\s*null\\)\\s*:\\s*null/', $source),
        "expected the email to be read from the decoded JSON body's 'email' field",
    );
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
        'checks DEV_HARNESS_ENABLED before anything else in the file except the OPTIONS short-circuit' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeChecksDevHarnessGateFirst',
        'sets Cache-Control: no-store unconditionally, before the DEV_HARNESS_ENABLED gate' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeSetsNoStore',
        'applies Cors::applyHeaders() from $config->allowedOrigins(), never a hardcoded/wildcard origin, before the DEV_HARNESS_ENABLED gate' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeUsesCors',
        'supports OPTIONS preflight via Cors::applyPreflightHeaders()' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeSupportsOptionsPreflight',
        'only accepts POST' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeOnlyAcceptsPost',
        'requires an application/json Content-Type before consuming' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeRequiresJsonContentType',
        'rejects a present, disallowed Origin before reading/consuming the credential' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeRejectsDisallowedOriginBeforeConsuming',
        'reads the email from the JSON request body, not the query string' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeReadsEmailFromJsonBody',
        'never logs the raw login code' =>
            'KanaGame\\Paddle\\Tests\\assertLastLoginCodeNeverLogsTheRawCode',
    ];
}
