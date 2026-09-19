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
    ];
}
