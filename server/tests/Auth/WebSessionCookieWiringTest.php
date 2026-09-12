<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Source-inspection regression tests for the Phase 3B cookie-transport
 * wiring across the five authenticated entrypoints (verify.php,
 * logout.php, auth/me.php, entitlement-me.php, purchase-intent.php).
 *
 * These entrypoints are plain top-level scripts with real header()/
 * $_COOKIE dependencies this repo's dependency-free CLI test runner
 * cannot exercise over real HTTP (see LastMagicLinkEntrypointTest.php's
 * own doc comment for why) -- so, matching that file's established
 * pattern, this asserts the WIRING itself via the actual source text:
 * every credentialed endpoint must go through
 * SessionCredentialResolver::resolve() fed by BOTH
 * SessionCredentialResolver::extractBearerToken() and
 * WebSessionCookie::readToken($_COOKIE), and verify.php's cookie-mode
 * branch must never place session_token in its own JSON response. The
 * underlying decision LOGIC (WebSessionCookie's cookie attributes,
 * SessionCredentialResolver's ambiguous-credential reject) is
 * separately unit-tested directly in WebSessionCookieTest.php and
 * SessionCredentialResolverTest.php -- this file only proves each
 * entrypoint actually calls into that logic instead of quietly keeping
 * its old Bearer-only inline parsing.
 */
function loadServerSource(string $relativePath): string
{
    $source = file_get_contents(__DIR__ . '/../../' . $relativePath);
    assertTrue($source !== false, "could not read {$relativePath}");
    /** @var string $source */
    return $source;
}

function assertCorsConstructedAsCredentialed(string $relativePath): void
{
    $source = loadServerSource($relativePath);

    assertTrue(
        (bool) preg_match(
            "/new Cors\\(\\s*\\\$config->allowedOrigins\\(\\),\\s*null,\\s*\\\$config->get\\('WEB_SESSION_COOKIE_ENABLED'\\)\\s*===\\s*'true'\\s*\\)/",
            $source,
        ),
        "{$relativePath} must construct Cors with the credentialed flag tied to WEB_SESSION_COOKIE_ENABLED, so Access-Control-Allow-Credentials is emitted only when cookie mode is actually on",
    );
}

function assertOriginCheckedForCookieCredential(string $relativePath): void
{
    $source = loadServerSource($relativePath);

    assertTrue(
        str_contains($source, '$cookieToken = $webSessionCookie->readToken($_COOKIE);'),
        "{$relativePath} must capture the cookie token in a named variable to check its presence before resolving",
    );
    assertTrue(
        (bool) preg_match(
            "/if \\(\\\$cookieToken !== null && !\\\$cors->isOriginAllowed\\(\\\$_SERVER\\['HTTP_ORIGIN'\\] \\?\\? null\\)\\)/",
            $source,
        ),
        "{$relativePath} must reject a cookie-authenticated request from a non-allowlisted Origin, as CSRF defense-in-depth beyond SameSite=Lax",
    );

    // The Origin check must run BEFORE the credential is resolved to a
    // session token, so an untrusted-origin cookie request never even
    // reaches session lookup.
    $originCheckPos = strpos($source, 'isOriginAllowed(');
    $resolvePos = strpos($source, 'SessionCredentialResolver::resolve(');
    assertTrue($originCheckPos !== false && $resolvePos !== false, 'expected both an Origin check and a resolve() call');
    assertTrue($originCheckPos < $resolvePos, 'the Origin check must run before SessionCredentialResolver::resolve()');
}

function assertUsesCredentialResolver(string $relativePath): void
{
    $source = loadServerSource($relativePath);

    assertTrue(
        str_contains($source, "require __DIR__ . '/../src/Auth/SessionCredentialResolver.php';")
            || str_contains($source, "require __DIR__ . '/src/Auth/SessionCredentialResolver.php';"),
        "{$relativePath} must require SessionCredentialResolver.php",
    );
    assertTrue(
        str_contains($source, "require __DIR__ . '/../src/Auth/WebSessionCookie.php';")
            || str_contains($source, "require __DIR__ . '/src/Auth/WebSessionCookie.php';"),
        "{$relativePath} must require WebSessionCookie.php",
    );
    assertTrue(
        str_contains($source, 'new WebSessionCookie('),
        "{$relativePath} must construct a WebSessionCookie",
    );
    assertTrue(
        (bool) preg_match(
            "/\\\$config->get\\('WEB_SESSION_COOKIE_ENABLED'\\)\\s*===\\s*'true'/",
            $source,
        ),
        "{$relativePath} must gate cookie mode on the exact string 'true', defaulting closed like DEV_HARNESS_ENABLED",
    );
    assertTrue(
        str_contains($source, 'SessionCredentialResolver::extractBearerToken('),
        "{$relativePath} must extract the Bearer token via SessionCredentialResolver, not raw inline parsing",
    );
    assertTrue(
        str_contains($source, '->readToken($_COOKIE)'),
        "{$relativePath} must read the cookie token via WebSessionCookie::readToken(\$_COOKIE)",
    );
    assertTrue(
        str_contains($source, 'SessionCredentialResolver::resolve('),
        "{$relativePath} must combine both credential sources via SessionCredentialResolver::resolve()",
    );
}

/**
 * @return array<string, callable(): void>
 */
function webSessionCookieWiringTests(): array
{
    return [
        'auth/me.php uses the shared credential resolver (Bearer + cookie)' => function () {
            assertUsesCredentialResolver('auth/me.php');
        },

        'entitlement-me.php uses the shared credential resolver (Bearer + cookie)' => function () {
            assertUsesCredentialResolver('entitlement-me.php');
        },

        'purchase-intent.php uses the shared credential resolver (Bearer + cookie)' => function () {
            assertUsesCredentialResolver('purchase-intent.php');
        },

        'auth/verify.php in cookie mode never places session_token in its own response' => function () {
            $source = loadServerSource('auth/verify.php');

            assertTrue(str_contains($source, 'new WebSessionCookie('), 'verify.php must construct a WebSessionCookie');
            assertTrue(str_contains($source, '$webSessionCookie->isEnabled()'), 'verify.php must branch on cookie-mode enablement');
            assertTrue(str_contains($source, '$webSessionCookie->issueHeader('), 'verify.php must issue the session cookie via WebSessionCookie::issueHeader()');
            assertTrue(
                (bool) preg_match("/header\\('Set-Cookie: '/", $source),
                'verify.php must actually send the Set-Cookie header, not just build it',
            );

            // Isolate the cookie-mode branch's own response body: from
            // "isEnabled()" up to the next "exit;" (its own early exit),
            // and assert THAT slice never mentions session_token.
            $enabledPos = strpos($source, '$webSessionCookie->isEnabled()');
            assertTrue($enabledPos !== false, 'expected an isEnabled() check');
            $branchEnd = strpos($source, 'exit;', $enabledPos);
            assertTrue($branchEnd !== false, 'expected the cookie-mode branch to end with its own exit;');
            $cookieBranch = substr($source, $enabledPos, $branchEnd - $enabledPos);

            assertFalse(
                str_contains($cookieBranch, "'session_token' =>"),
                'the cookie-mode branch must never place the raw session_token in the JSON response body -- it lives only in the HttpOnly cookie',
            );
        },

        'auth/verify.php in Bearer mode (cookie mode off) is unchanged: still returns session_token' => function () {
            $source = loadServerSource('auth/verify.php');
            $branchEnd = strpos($source, '$webSessionCookie->isEnabled()');
            assertTrue($branchEnd !== false, 'expected an isEnabled() check');
            $tail = substr($source, $branchEnd);

            assertTrue(
                str_contains($tail, "'session_token' => \$result->sessionToken"),
                'the non-cookie-mode fallback response must still return session_token, matching pre-Phase-3B behavior for Bearer/dev-harness callers',
            );
        },

        'auth/logout.php clears the session cookie on both the no-credential and successful-revoke paths' => function () {
            $source = loadServerSource('auth/logout.php');

            assertTrue(str_contains($source, 'new WebSessionCookie('), 'logout.php must construct a WebSessionCookie');
            assertUsesCredentialResolver('auth/logout.php');

            $deleteCalls = substr_count($source, '$webSessionCookie->deleteHeader()');
            assertTrue(
                $deleteCalls >= 2,
                'logout.php must call deleteHeader() on both the no-credential-supplied path and the successful-revoke path, so a stale/mismatched cookie is always cleared on logout',
            );
        },

        'all five credentialed entrypoints construct Cors with the credentialed flag tied to cookie-mode config' => function () {
            foreach (['auth/verify.php', 'auth/logout.php', 'auth/me.php', 'entitlement-me.php', 'purchase-intent.php'] as $path) {
                assertCorsConstructedAsCredentialed($path);
            }
        },

        'auth/logout.php rejects a cookie-authenticated request from a non-allowlisted Origin before session lookup' => function () {
            assertOriginCheckedForCookieCredential('auth/logout.php');
        },

        'purchase-intent.php rejects a cookie-authenticated request from a non-allowlisted Origin before session lookup' => function () {
            assertOriginCheckedForCookieCredential('purchase-intent.php');
        },

        // Security-review finding: verify.php ISSUES the session cookie
        // (unlike logout.php/purchase-intent.php, which check a cookie
        // that already exists) -- a login-CSRF attack has a cross-site
        // page silently POST an attacker-controlled magic-link token to
        // a victim's browser, planting the attacker's session in the
        // victim's cookie jar. This must be rejected before the
        // (one-time-use) token is even read, so a rejected attempt
        // never burns it for a legitimate follow-up attempt.
        'auth/verify.php rejects a cookie-mode request from a non-allowlisted Origin before the token is even read' => function () {
            $source = loadServerSource('auth/verify.php');

            assertTrue(
                (bool) preg_match(
                    "/if \\(\\\$webSessionCookie->isEnabled\\(\\) && !\\\$cors->isOriginAllowed\\(\\\$_SERVER\\['HTTP_ORIGIN'\\] \\?\\? null\\)\\)/",
                    $source,
                ),
                'verify.php must reject a cookie-mode request from a non-allowlisted Origin -- login-CSRF/session-fixation defense',
            );

            $originCheckPos = strpos($source, "\$webSessionCookie->isEnabled() && !\$cors->isOriginAllowed(");
            $tokenReadPos = strpos($source, "\$rawToken = is_array(\$body)");
            assertTrue($originCheckPos !== false && $tokenReadPos !== false, 'expected both the Origin check and the token-read line');
            assertTrue(
                $originCheckPos < $tokenReadPos,
                'the Origin check must run BEFORE the magic-link token is read/consumed, so a rejected cross-origin attempt never burns the one-time-use token',
            );
        },

        'auth/verify.php constructs WebSessionCookie exactly once (no duplicate/conflicting instances)' => function () {
            $source = loadServerSource('auth/verify.php');
            assertSame(1, substr_count($source, 'new WebSessionCookie('), 'verify.php must construct WebSessionCookie exactly once, reused for both the Origin check and the later issueHeader() call');
        },
    ];
}
