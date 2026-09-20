<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/WebSessionCookieWiringTest.php';

/**
 * Source-inspection regression test for the session-adjacent entrypoints
 * that can emit a session-minting `Set-Cookie`: auth/me.php,
 * entitlement-me.php, purchase-intent.php, auth/verify.php,
 * auth/verify-code.php, and auth/logout.php. Each must send
 * `Cache-Control: no-store` unconditionally, before any response-status
 * branch, so no caching intermediary (proxy, CDN edge, browser prefetch
 * cache) can ever store or replay a response carrying a session Set-Cookie
 * to a different request/client -- see auth/me.php's doc comment and
 * docs/superpowers/specs/2026-09-17-email-otp-persistent-login-design.md
 * for the full rationale, including why the underlying refresh-on-GET
 * behavior itself was deliberately kept rather than moved behind a POST.
 *
 * This is the same static-source-inspection approach already used by
 * WebSessionCookieWiringTest.php and the dev-only entrypoint tests, for
 * the same reason: these are plain top-level scripts with real
 * header()/$_COOKIE dependencies this repo's dependency-free CLI test
 * runner cannot exercise over real HTTP.
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
