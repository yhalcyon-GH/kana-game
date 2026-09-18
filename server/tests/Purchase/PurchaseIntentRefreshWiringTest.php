<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Source-inspection wiring test for server/purchase-intent.php, following
 * the exact file-reading pattern of SignOutOthersWiringTest.php and
 * CapabilitiesWiringTest.php (no HTTP server, no PDO). Regresses the same
 * gap as EntitlementMeRefreshWiringTest.php: this endpoint previously
 * called CurrentUserService::resolve() only, so a caller whose session
 * cookie had expired but who still held a valid 90-day remember-me
 * cookie was incorrectly 401'd here.
 *
 * Also asserts the Origin/CSRF check (see the identical check already in
 * logout.php and sign-out-others.php) was widened to cover the remember
 * cookie: a state-changing request authenticated solely via the remember
 * cookie must not skip Origin verification.
 */
function loadPurchaseIntentSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../purchase-intent.php');
    assertTrue($source !== false, 'could not read purchase-intent.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function purchaseIntentRefreshWiringTests(): array
{
    return [
        'purchase-intent.php resolves the current user via resolveOrRefresh(), not resolve() alone' => function () {
            $source = loadPurchaseIntentSource();
            assertTrue(str_contains($source, 'resolveOrRefresh'), 'expected purchase-intent.php to call CurrentUserService::resolveOrRefresh()');
        },
        'purchase-intent.php constructs PersistentSessionRepository to support the refresh path' => function () {
            $source = loadPurchaseIntentSource();
            assertTrue(str_contains($source, 'PersistentSessionRepository'), 'expected purchase-intent.php to require/construct PersistentSessionRepository');
        },
        'purchase-intent.php reissues a Set-Cookie only when a refresh actually happened' => function () {
            $source = loadPurchaseIntentSource();
            assertTrue(str_contains($source, 'refreshed_session_token'), 'expected purchase-intent.php to branch on refreshed_session_token, matching me.php');
            assertTrue(str_contains($source, "Set-Cookie: '"), 'expected purchase-intent.php to reissue a Set-Cookie header for a refreshed session, matching me.php');
        },
        'purchase-intent.php widens the Origin/CSRF check to cover the remember cookie, not just the session cookie' => function () {
            $source = loadPurchaseIntentSource();
            assertTrue(
                str_contains($source, '($cookieToken !== null || $rememberToken !== null) && !$cors->isOriginAllowed('),
                'expected the exact widened Origin-check condition (matching logout.php/sign-out-others.php) requiring Origin verification when EITHER the session cookie or the remember cookie is present',
            );
        },
    ];
}
