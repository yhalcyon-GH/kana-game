<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadLogoutSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/logout.php');
    assertTrue($source !== false, 'could not read auth/logout.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function logoutWiringTests(): array
{
    return [
        'logout.php also revokes the linked persistent session and deletes the remember cookie' => function () {
            $source = loadLogoutSource();
            assertTrue(str_contains($source, 'findActiveByRawToken'), 'must look up the remember-cookie persistent session to revoke it');
            assertTrue(str_contains($source, '$rememberCookie->deleteHeader()'), 'must delete the remember cookie alongside the session cookie');
        },
        'logout.php cascade-revokes sessions linked to the revoked persistent session' => function () {
            $source = loadLogoutSource();
            assertTrue(str_contains($source, 'revokeByPersistentSessionId'), 'must cascade-revoke sessions linked to the revoked persistent session');
        },
        'logout.php still leaves both cookies untouched on the ambiguous-credential 401 path (no forced-logout side effect on a rejected request)' => function () {
            $source = loadLogoutSource();
            $ambiguousBlockStart = strpos($source, 'if ($credential->ambiguous)');
            $ambiguousBlockEnd = strpos($source, 'exit;', $ambiguousBlockStart);
            $ambiguousBlock = substr($source, $ambiguousBlockStart, $ambiguousBlockEnd - $ambiguousBlockStart);
            assertFalse(str_contains($ambiguousBlock, 'Set-Cookie'), 'the ambiguous-credential branch must not send any Set-Cookie header, session or remember');
        },
    ];
}
