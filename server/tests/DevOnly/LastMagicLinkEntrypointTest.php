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
 * This parses the file's own source instead, directly regressing three
 * separate incidents found via live XServer black-box testing / audit:
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
 * 3. (Issue #360) Being a plain GET, a cross-site request could still
 *    reach the server and burn the pending value as a side effect even
 *    though CORS stopped the attacker from reading the response. POST
 *    + a required `application/json` body closes this (see the
 *    entrypoint's own doc comment for the full mechanism).
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

    // Must be set before the DEV_HARNESS_ENABLED gate (the first
    // response-status branch for a non-OPTIONS request) so every
    // response -- 403/405/415/400/404/500/200 alike -- carries it, not
    // only the success path. The unauthenticated OPTIONS-preflight
    // short-circuit above it sends its own fixed 204 and never reaches
    // this header, which is fine: it carries no cacheable body.
    $noStorePos = strpos($source, "header('Cache-Control: no-store')");
    $gatePos = strpos($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'");
    assertTrue(
        $noStorePos !== false && $gatePos !== false && $noStorePos < $gatePos,
        'Cache-Control: no-store must be set before the DEV_HARNESS_ENABLED gate, so every response status carries it',
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

    // applyHeaders() must run before the DEV_HARNESS_ENABLED gate, same
    // reasoning as the no-store check above -- every status code for a
    // non-OPTIONS request, not only the success path, needs the CORS
    // header for a browser to read it.
    $corsCallPos = strpos($source, '$cors->applyHeaders(');
    $gatePos = strpos($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'");
    assertTrue(
        $corsCallPos !== false && $gatePos !== false && $corsCallPos < $gatePos,
        'Cors::applyHeaders() must be called before the DEV_HARNESS_ENABLED gate, so every response status is readable cross-origin',
    );
}

function assertLastMagicLinkEntrypointDevHarnessGateUnchanged(): void
{
    $source = loadEntrypointSource();

    assertTrue(
        str_contains($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'"),
        'the DEV_HARNESS_ENABLED gate must remain an exact-string, default-closed check',
    );

    $gatePos = strpos($source, "\$config->get('DEV_HARNESS_ENABLED') !== 'true'");
    $optionsCheckPos = strpos($source, "=== 'OPTIONS'");
    assertTrue(
        $gatePos !== false && $optionsCheckPos !== false && $optionsCheckPos < $gatePos,
        'the OPTIONS-preflight short-circuit must run before the DEV_HARNESS_ENABLED gate',
    );

    // Source comments can legitimately contain text such as "if (...)",
    // so counting lexical "if (" tokens is brittle. The security
    // invariant we actually care about is response behavior: before the
    // default-closed harness gate, the only HTTP status this entrypoint
    // may emit is the fixed 204 OPTIONS response.
    $beforeGate = substr($source, 0, $gatePos);
    preg_match_all('/http_response_code\((\d+)\)/', $beforeGate, $statusMatches);
    assertSame(
        ['204'],
        $statusMatches[1],
        'before the DEV_HARNESS_ENABLED gate, only the fixed 204 OPTIONS response is permitted',
    );
}

function assertLastMagicLinkEntrypointSupportsOptionsPreflight(): void
{
    $source = loadEntrypointSource();

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

function assertLastMagicLinkEntrypointOnlyAcceptsPost(): void
{
    $source = loadEntrypointSource();

    assertFalse(str_contains($source, "!== 'GET'"), 'GET must no longer be accepted (Issue #360)');
    assertTrue(str_contains($source, "!== 'POST'"), 'expected a POST method guard');
    assertTrue(str_contains($source, '405'), 'expected a 405 response for non-POST requests');
}

function assertLastMagicLinkEntrypointRequiresJsonContentType(): void
{
    $source = loadEntrypointSource();

    assertTrue(
        str_contains($source, "\$_SERVER['CONTENT_TYPE'] ?? ''"),
        'expected the Content-Type header to be inspected',
    );
    assertTrue(
        str_contains($source, '415'),
        'expected a 415 response for a non-JSON Content-Type',
    );

    // The Content-Type check must run before the body is ever read, and
    // before the credential store is ever touched.
    $contentTypePos = strpos($source, "\$_SERVER['CONTENT_TYPE'] ?? ''");
    $bodyReadPos = strpos($source, "file_get_contents('php://input')");
    $consumePos = strpos($source, '->consume(');
    assertTrue(
        $contentTypePos !== false && $bodyReadPos !== false && $consumePos !== false
            && $contentTypePos < $bodyReadPos && $bodyReadPos < $consumePos,
        'Content-Type must be validated before the body is read, and before the credential is consumed',
    );
}

function assertLastMagicLinkEntrypointRejectsDisallowedOriginBeforeConsuming(): void
{
    $source = loadEntrypointSource();

    assertTrue(
        (bool) preg_match('/\\$cors->isOriginAllowed\\(\\s*\\$requestOrigin\\s*\\)/', $source),
        'expected a present Origin to be checked against Cors::isOriginAllowed()',
    );
    assertTrue(str_contains($source, '403'), 'expected a 403 response for a disallowed Origin');

    // A missing Origin (direct test/dev callers) must remain supported --
    // the rejection must be conditioned on the Origin being present.
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

function assertLastMagicLinkEntrypointReadsEmailFromJsonBody(): void
{
    $source = loadEntrypointSource();

    assertFalse(str_contains($source, "\$_GET['email']"), 'email must no longer be read from the query string (Issue #360)');
    assertTrue(
        (bool) preg_match('/is_array\\(\\$body\\)\\s*\\?\\s*\\(\\$body\\[\'email\'\\]\\s*\\?\\?\\s*null\\)\\s*:\\s*null/', $source),
        "expected the email to be read from the decoded JSON body's 'email' field",
    );
}

/**
 * @return array<string, callable(): void>
 */
function lastMagicLinkEntrypointTests(): array
{
    return [
        'sets Cache-Control: no-store unconditionally, before the DEV_HARNESS_ENABLED gate' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointSetsNoStore',
        'applies Cors::applyHeaders() from $config->allowedOrigins(), never a hardcoded/wildcard origin, before the DEV_HARNESS_ENABLED gate' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointUsesCors',
        'the DEV_HARNESS_ENABLED gate is the first response-status branch after the OPTIONS short-circuit' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointDevHarnessGateUnchanged',
        'supports OPTIONS preflight via Cors::applyPreflightHeaders()' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointSupportsOptionsPreflight',
        'only accepts POST' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointOnlyAcceptsPost',
        'requires an application/json Content-Type before consuming' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointRequiresJsonContentType',
        'rejects a present, disallowed Origin before reading/consuming the credential' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointRejectsDisallowedOriginBeforeConsuming',
        'reads the email from the JSON request body, not the query string' =>
            'KanaGame\\Paddle\\Tests\\assertLastMagicLinkEntrypointReadsEmailFromJsonBody',
    ];
}
