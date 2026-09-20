<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadSignOutOthersSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/sign-out-others.php');
    assertTrue($source !== false, 'could not read auth/sign-out-others.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function signOutOthersWiringTests(): array
{
    return [
        'sign-out-others.php only POST is accepted' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(str_contains($source, "!== 'POST'"), 'expected a POST method guard');
            assertTrue(str_contains($source, '405'), 'expected a 405 response for non-POST');
        },
        'sign-out-others.php requires authentication before doing anything' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(str_contains($source, '401'), 'expected a 401 response for unauthenticated callers');
            assertTrue(str_contains($source, "'unauthorized'"), "expected an 'unauthorized' error body");
        },
        'sign-out-others.php requires a remember cookie to identify which persistent session to KEEP' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(str_contains($source, 'findActiveByRawToken'), 'expected findActiveByRawToken to resolve the caller\'s own persistent session');
            assertTrue(str_contains($source, "'no persistent session on this browser'"), "expected a 'no persistent session on this browser' error body");
        },
        'sign-out-others.php cascade-revokes sessions linked to every persistent session it revokes' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(str_contains($source, 'revokeAllForUserExcept'), 'expected revokeAllForUserExcept to revoke every other persistent session');
            assertTrue(str_contains($source, 'revokeByPersistentSessionId'), 'expected revokeByPersistentSessionId to cascade-revoke linked sessions');
        },
        'sign-out-others.php rejects a remember cookie that belongs to a different account' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(
                str_contains($source, "$ownPersistentSession['user_id'] !== $resolution['user']['user_id']"),
                'remember credential user must match the resolved current user before any revocation',
            );
        },
        'sign-out-others.php revokes every other normal session including unlinked Magic-Link sessions while preserving the exact current token' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(str_contains($source, "$currentSessionRawToken = $resolution['refreshed_session_token'] ?? $credential->token"), 'must preserve the actual session token used for this request, including a freshly refreshed one');
            assertTrue(str_contains($source, 'revokeAllForUserExceptRawToken('), 'must revoke every other normal session, not only sessions linked to persistent credentials');
            assertTrue(str_contains($source, "$webSessionCookie->issueHeader($resolution['refreshed_session_token']"), 'a remember-only caller that was refreshed must receive the newly preserved session cookie');
        },
    ];
}
