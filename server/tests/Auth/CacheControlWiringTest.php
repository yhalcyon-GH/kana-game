<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/WebSessionCookieWiringTest.php';

/**
 * Source-inspection regression test for session-adjacent entrypoints that
 * must send `Cache-Control: no-store`: auth/me.php, entitlement-me.php,
 * purchase-intent.php, auth/verify.php, auth/verify-code.php, auth/logout.php,
 * and auth/sign-out-others.php.
 *
 * Some of these responses can mint or clear cookies; sign-out-others mutates
 * authentication state without issuing a cookie. In all cases an intermediary
 * must not cache and replay the response. The assertion is intentionally made
 * before the normal REQUEST_METHOD branch so every non-preflight status path
 * carries no-store.
 *
 * This is the same static-source-inspection approach already used by
 * WebSessionCookieWiringTest.php and the dev-only entrypoint tests, because
 * these top-level scripts depend on real header()/$_COOKIE behavior that the
 * dependency-free CLI test runner cannot exercise over HTTP.
 */
function assertEntrypointSetsNoStoreBeforeFirstBranch(string $relativePath): void
{
    $source = loadServerSource($relativePath);

    assertTrue(
        (bool) preg_match("/header\\(\\s*'Cache-Control:\\s*no-store'\\s*\\)/", $source),
        "{$relativePath} must call header('Cache-Control: no-store')",
    );

    $noStorePos = strpos($source, "header('Cache-Control: no-store')");
    // The OPTIONS-preflight short-circuit (its own early exit before any
    // headers are set) is allowed before this call; what matters is that
    // no-store is set before the METHOD-mismatch branch, so every real
    // (non-preflight) response status -- 405/401/400/409/500/200 alike --
    // carries it.
    $methodBranchPos = strpos($source, "!== '");
    assertTrue(
        $noStorePos !== false && $methodBranchPos !== false && $noStorePos < $methodBranchPos,
        "{$relativePath} must set Cache-Control: no-store before its REQUEST_METHOD branch, so every response status carries it",
    );
}

/**
 * @return array<string, callable(): void>
 */
function cacheControlWiringTests(): array
{
    $entrypoints = [
        'auth/me.php',
        'entitlement-me.php',
        'purchase-intent.php',
        'auth/verify.php',
        'auth/verify-code.php',
        'auth/logout.php',
        'auth/sign-out-others.php',
    ];

    $tests = [];
    foreach ($entrypoints as $path) {
        $tests["{$path} sets Cache-Control: no-store unconditionally, before its REQUEST_METHOD branch"] =
            static fn () => assertEntrypointSetsNoStoreBeforeFirstBranch($path);
    }

    return $tests;
}
