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

/**
 * CSRF-defense-in-depth property for entrypoints (logout.php,
 * sign-out-others.php, purchase-intent.php) that can also authenticate/
 * act purely from the persistent "remember this browser" cookie -- the
 * Origin check on those entrypoints must therefore gate on EITHER
 * cookie being present, not just the session cookie, or a remember-
 * cookie-only request bypasses the CSRF defense entirely
 * (security-review finding, PR #298; widened to purchase-intent.php
 * once it started authenticating via resolveOrRefresh() too, PR B).
 */
function assertOriginCheckedForCookieOrRememberCredential(string $relativePath): void
{
    $source = loadServerSource($relativePath);

    assertTrue(
        str_contains($source, '$cookieToken = $webSessionCookie->readToken($_COOKIE);'),
        "{$relativePath} must capture the session cookie token in a named variable to check its presence before resolving",
    );
    assertTrue(
        str_contains($source, '$rememberToken = $rememberCookie->readToken($_COOKIE);'),
        "{$relativePath} must capture the remember cookie token in a named variable to check its presence before resolving",
    );
    assertTrue(
        (bool) preg_match(
            "/if \\(\\(\\\$cookieToken !== null \\|\\| \\\$rememberToken !== null\\) && !\\\$cors->isOriginAllowed\\(\\\$_SERVER\\['HTTP_ORIGIN'\\] \\?\\? null\\)\\)/",
            $source,
        ),
        "{$relativePath} must reject a request authenticated by EITHER cookie from a non-allowlisted Origin, as CSRF defense-in-depth beyond SameSite=Lax",
    );

    // The remember-cookie token must be read BEFORE the Origin check
    // runs, or the check above can never see it.
    $rememberReadPos = strpos($source, '$rememberToken = $rememberCookie->readToken($_COOKIE);');
    $originCheckPos = strpos($source, 'isOriginAllowed(');
    assertTrue($rememberReadPos !== false && $originCheckPos !== false, 'expected both a remember-token read and an Origin check');
    assertTrue($rememberReadPos < $originCheckPos, 'the remember token must be read before the Origin check runs');
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

        'auth/request-link.php enables credentialed CORS and only sets a host-only browser-binding cookie for an actually issued Magic Link' => function () {
            $source = loadServerSource('auth/request-link.php');

            assertTrue(str_contains($source, "\$cookieModeEnabled = \$config->get('WEB_SESSION_COOKIE_ENABLED') === 'true';"), 'request-link must derive cookie mode from the same closed-by-default setting');
            assertTrue(str_contains($source, 'new Cors($config->allowedOrigins(), null, $cookieModeEnabled)'), 'request-link must enable Access-Control-Allow-Credentials only in cookie mode');
            assertTrue(str_contains($source, 'WebSessionCookie::MAGIC_LINK_BINDING_DEFAULT_NAME'), 'request-link must use the dedicated host-only binding-cookie name');
            assertTrue(str_contains($source, 'random_bytes(32)'), 'browser binding must use a fresh 256-bit CSPRNG secret');
            assertTrue(str_contains($source, '$service->requestLink($rawEmail, $clientIp, $rawBrowserBinding)'), 'the same raw binding must be passed to the token issuer');
            assertTrue(str_contains($source, 'if ($issued && $rawBrowserBinding !== null)'), 'the cookie must not overwrite a prior valid binding when rate limiting/malformed input prevents issuing a new token');
            assertTrue(str_contains($source, '$browserBindingCookie->issueHeader('), 'an issued production Magic Link must set the Secure+HttpOnly binding cookie');
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

        'auth/logout.php rejects a request authenticated by either the session or remember cookie from a non-allowlisted Origin before session/persistent lookup' => function () {
            assertOriginCheckedForCookieOrRememberCredential('auth/logout.php');
        },

        'auth/sign-out-others.php rejects a request authenticated by either the session or remember cookie from a non-allowlisted Origin before session/persistent lookup' => function () {
            assertOriginCheckedForCookieOrRememberCredential('auth/sign-out-others.php');
        },

        // purchase-intent.php's Origin check was widened (this PR) from
        // "session cookie only" to "session cookie OR remember cookie",
        // matching logout.php/sign-out-others.php exactly: since this
        // endpoint now authenticates via resolveOrRefresh(), a remember-
        // cookie-only request can also create a real purchase_intents row,
        // so it needs the same Origin defense the session-cookie path
        // already had. See assertOriginCheckedForCookieOrRememberCredential()'s
        // own doc comment.
        'purchase-intent.php rejects a request authenticated by either the session or remember cookie from a non-allowlisted Origin before session lookup' => function () {
            assertOriginCheckedForCookieOrRememberCredential('purchase-intent.php');
        },

        // Security-review finding: verify.php ISSUES the session cookie
        // (unlike logout.php/purchase-intent.php, which check a cookie
        // that already exists) -- a login-CSRF attack has a cross-site
        // page silently POST an attacker-controlled magic-link token to
        // a victim's browser, planting the attacker's session in the
        // victim's cookie jar. This must be rejected before the
        // (one-time-use) token is even read, so a rejected attempt
        // never burns it for a legitimate follow-up attempt.
        'auth/verify.php requires the browser binding before consuming a production Magic Link and clears stale persistent login on success' => function () {
            $source = loadServerSource('auth/verify.php');

            $bindingReadPos = strpos($source, '$browserBindingCookie->readToken($_COOKIE)');
            $verifyCallPos = strpos($source, '$service->verify(');
            assertTrue($bindingReadPos !== false && $verifyCallPos !== false, 'verify.php must read and pass the browser-binding cookie to the service');
            assertTrue(str_contains($source, '$cookieModeEnabled,'), 'verify.php must require browser binding whenever Production cookie mode is enabled');

            $rememberDeletePos = strpos($source, '$rememberCookie->deleteHeader()');
            $sessionIssuePos = strpos($source, '$webSessionCookie->issueHeader(');
            assertTrue($sessionIssuePos !== false && $rememberDeletePos !== false && $sessionIssuePos < $rememberDeletePos, 'successful Magic-Link session issue must be followed by stale remember-cookie deletion');
        },

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

        'auth/verify.php uses separate host-only session, remember, and Magic-Link-binding cookies in cookie mode' => function () {
            $source = loadServerSource('auth/verify.php');

            assertSame(3, substr_count($source, 'new WebSessionCookie('), 'verify.php should construct session, remember, and Magic-Link-binding cookie helpers exactly once each');
            assertTrue(str_contains($source, 'WebSessionCookie::MAGIC_LINK_BINDING_DEFAULT_NAME'), 'verify.php must read the dedicated browser-binding cookie');
            assertTrue(str_contains($source, '$rememberCookie->deleteHeader()'), 'successful Magic-Link login must clear any stale remember cookie');
            assertTrue(str_contains($source, '$browserBindingCookie->deleteHeader()'), 'successful Magic-Link login must clear its one-time browser-binding cookie');
            assertTrue(
                str_contains($source, '$browserBindingCookie->readToken($_COOKIE)'),
                'verify.php must pass the HttpOnly browser-binding cookie into MagicLinkAuthService before the token can be consumed',
            );
        },

        // Code-review finding: an ambiguous (Bearer != cookie) credential
        // was being silently folded into logout.php's "nothing to
        // revoke" 200 OK path -- indistinguishable from a genuinely
        // successful logout. Fixed by having SessionCredentialResolver
        // return a SessionCredentialResolution value object instead of
        // a bare `?string`, so "no credential" and "ambiguous credential"
        // are no longer the same value. These assert the FIX, not just
        // the original mismatch-reject behavior (already covered by
        // SessionCredentialResolverTest.php at the pure-logic level).
        'auth/logout.php checks $credential->ambiguous BEFORE the no-credential/idempotent branch, and rejects with 401' => function () {
            $source = loadServerSource('auth/logout.php');

            assertTrue(str_contains($source, 'if ($credential->ambiguous) {'), 'logout.php must check the ambiguous flag');

            $ambiguousCheckPos = strpos($source, 'if ($credential->ambiguous)');
            $noCredentialCheckPos = strpos($source, '$credential->token === null');
            assertTrue($ambiguousCheckPos !== false && $noCredentialCheckPos !== false, 'expected both checks to be present');
            assertTrue($ambiguousCheckPos < $noCredentialCheckPos, 'the ambiguous check must run before the no-credential/idempotent-200 check, so an ambiguous pair can never fall through to it');

            // The ambiguous branch's own 401 must come strictly between
            // the two checks above (i.e. inside that branch), not
            // reused from some unrelated later 401.
            $responseCodePos = strpos($source, 'http_response_code(401)', $ambiguousCheckPos);
            assertTrue(
                $responseCodePos !== false && $responseCodePos < $noCredentialCheckPos,
                'the ambiguous branch must reject with its own http_response_code(401) before the no-credential branch',
            );
        },

        'auth/logout.php never calls deleteHeader() inside the ambiguous branch (a rejected request must not look like a logout)' => function () {
            $source = loadServerSource('auth/logout.php');
            $ambiguousPos = strpos($source, 'if ($credential->ambiguous)');
            assertTrue($ambiguousPos !== false, 'expected an ambiguous branch');
            $branchEnd = strpos($source, 'exit;', $ambiguousPos);
            assertTrue($branchEnd !== false, 'expected the ambiguous branch to end with its own exit;');
            $ambiguousBranch = substr($source, $ambiguousPos, $branchEnd - $ambiguousPos);

            assertFalse(
                str_contains($ambiguousBranch, 'deleteHeader()'),
                'the ambiguous branch must never send a Set-Cookie deletion -- that would be a state change (an effective forced logout) triggered by an untrusted/malformed credential pair',
            );
            assertFalse(
                str_contains($ambiguousBranch, '->logout('),
                'the ambiguous branch must never call CurrentUserService::logout() / attempt a revoke',
            );
            assertFalse(
                str_contains($ambiguousBranch, 'error_log('),
                'the ambiguous branch must never log anything -- an ambiguous credential is a normal, expected client-side condition, not a server error worth logging',
            );
            assertFalse(
                (bool) preg_match('/\$(bearerToken|cookieToken|rawSessionToken)\b/', $ambiguousBranch),
                'the ambiguous branch response must never reference the raw Bearer/cookie token values -- only the generic {"error":"unauthorized"} body',
            );
        },

        'auth/logout.php never attempts CurrentUserService::logout() before the ambiguous check has run' => function () {
            $source = loadServerSource('auth/logout.php');
            $ambiguousPos = strpos($source, 'if ($credential->ambiguous)');
            $logoutCallPos = strpos($source, '$currentUser->logout(');
            assertTrue($ambiguousPos !== false && $logoutCallPos !== false, 'expected both an ambiguous check and a logout() call');
            assertTrue($ambiguousPos < $logoutCallPos, 'the ambiguous check must run before any revoke attempt');
        },

        // Security-review finding (post-merge, PR #303): the correction
        // pass above originally gave entitlement-me.php and
        // purchase-intent.php the SAME treatment auth/me.php already had
        // -- $credential->token (null for BOTH a missing and an ambiguous
        // credential) fed straight into resolveOrRefresh(), relying on
        // the remember-cookie fallback only ever authenticating as its
        // own independently-valid owner. An independent review flagged
        // that this still lets a disagreeing Bearer/cookie pair reach a
        // successful, cookie-issuing outcome via the remember cookie,
        // which is inconsistent with logout.php's own ambiguous branch
        // (SessionCredentialResolution's contract exists specifically so
        // callers CAN distinguish "missing" from "disagreeing" -- these
        // two endpoints must actually use that distinction, matching
        // logout.php, rather than re-collapsing it). Both entrypoints now
        // check $credential->ambiguous and reject with 401 BEFORE
        // resolveOrRefresh() is ever called, so an ambiguous pair can
        // never reach the remember-cookie fallback at all. A genuinely
        // missing session credential is unaffected and still falls
        // through to that fallback. See CurrentUserServiceTest.php's
        // "ambiguous credential pair must never reach the remember-cookie
        // fallback" cases for the resolver-level proof, and this test for
        // the entrypoint-level wiring proof.
        'every resolveOrRefresh authenticated entrypoint rejects an ambiguous credential with 401 before remember-cookie fallback' => function () {
            foreach (['auth/me.php', 'auth/sign-out-others.php', 'entitlement-me.php', 'purchase-intent.php'] as $path) {
                $source = loadServerSource($path);
                assertTrue(
                    str_contains($source, 'if ($credential->ambiguous) {'),
                    "{$path} must check \$credential->ambiguous, matching auth/logout.php's own ambiguous branch",
                );
                assertTrue(
                    str_contains($source, '->resolveOrRefresh($credential->token, $rememberToken);'),
                    "{$path} must still pass \$credential->token into resolveOrRefresh() for the genuinely-missing-credential case",
                );

                $ambiguousCheckPos = strpos($source, 'if ($credential->ambiguous) {');
                $resolveOrRefreshPos = strpos($source, '->resolveOrRefresh($credential->token, $rememberToken);');
                assertTrue(
                    $ambiguousCheckPos !== false && $resolveOrRefreshPos !== false,
                    "expected both the ambiguous check and the resolveOrRefresh() call in {$path}",
                );
                assertTrue(
                    $ambiguousCheckPos < $resolveOrRefreshPos,
                    "{$path} must reject an ambiguous credential BEFORE resolveOrRefresh() runs, so it never reaches the remember-cookie fallback",
                );

                $ambiguousBranchEnd = strpos($source, 'exit;', $ambiguousCheckPos);
                assertTrue($ambiguousBranchEnd !== false, "expected the ambiguous branch in {$path} to end with its own exit;");
                $ambiguousBranch = substr($source, $ambiguousCheckPos, $ambiguousBranchEnd - $ambiguousCheckPos);
                assertTrue(
                    str_contains($ambiguousBranch, 'http_response_code(401)'),
                    "{$path}'s ambiguous branch must reject with 401, matching auth/logout.php",
                );
            }
        },

        // auth/me.php still permits a genuinely missing/expired normal
        // session to refresh from a valid remember cookie, but the
        // ambiguous Bearer+cookie case is rejected by the test above
        // before this path can run.
        'me.php calls CurrentUserService::resolveOrRefresh(), not just resolve(), so a valid remember cookie can silently refresh an expired session' => function () {
            $source = loadServerSource('auth/me.php');
            assertTrue(str_contains($source, '->resolveOrRefresh('), 'me.php must use the persistent-refresh-aware resolver');
        },

        'me.php reissues the session Set-Cookie only when resolveOrRefresh() actually minted a new session token' => function () {
            $source = loadServerSource('auth/me.php');
            $refreshedTokenCheckPos = strpos($source, "'refreshed_session_token'");
            $setCookiePos = strpos($source, 'Set-Cookie:');
            assertTrue($refreshedTokenCheckPos !== false && $setCookiePos !== false, 'expected both a refreshed_session_token check and a Set-Cookie header');
            assertTrue($refreshedTokenCheckPos < $setCookiePos, 'must check refreshed_session_token before issuing a new Set-Cookie header');
        },
    ];
}
