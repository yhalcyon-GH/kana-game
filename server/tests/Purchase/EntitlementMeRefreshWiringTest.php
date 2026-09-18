<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Source-inspection wiring test for server/entitlement-me.php, following
 * the exact file-reading pattern of SignOutOthersWiringTest.php and
 * CapabilitiesWiringTest.php (no HTTP server, no PDO). Regresses the gap
 * found in PR A review: this endpoint previously called
 * CurrentUserService::resolve() only, so a caller whose session cookie
 * had expired but who still held a valid 90-day remember-me cookie was
 * incorrectly 401'd here even though server/auth/me.php would have
 * transparently refreshed them. This test asserts the entrypoint now
 * wires resolveOrRefresh() the same way me.php does.
 */
function loadEntitlementMeSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../entitlement-me.php');
    assertTrue($source !== false, 'could not read entitlement-me.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function entitlementMeRefreshWiringTests(): array
{
    return [
        'entitlement-me.php resolves the current user via resolveOrRefresh(), not resolve() alone' => function () {
            $source = loadEntitlementMeSource();
            assertTrue(str_contains($source, 'resolveOrRefresh'), 'expected entitlement-me.php to call CurrentUserService::resolveOrRefresh()');
        },
        'entitlement-me.php constructs PersistentSessionRepository to support the refresh path' => function () {
            $source = loadEntitlementMeSource();
            assertTrue(str_contains($source, 'PersistentSessionRepository'), 'expected entitlement-me.php to require/construct PersistentSessionRepository');
        },
        'entitlement-me.php reissues a Set-Cookie only when a refresh actually happened' => function () {
            $source = loadEntitlementMeSource();
            assertTrue(str_contains($source, 'refreshed_session_token'), 'expected entitlement-me.php to branch on refreshed_session_token, matching me.php');
            assertTrue(str_contains($source, "Set-Cookie: '"), 'expected entitlement-me.php to reissue a Set-Cookie header for a refreshed session, matching me.php');
        },
    ];
}
