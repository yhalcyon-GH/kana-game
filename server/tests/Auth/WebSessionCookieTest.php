<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\WebSessionCookie;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/WebSessionCookie.php';

/**
 * @return array<string, callable(): void>
 */
function webSessionCookieTests(): array
{
    return [
        'default cookie name is __Host-tamamizu_session' => function () {
            assertSame('__Host-tamamizu_session', WebSessionCookie::DEFAULT_NAME, 'default cookie name must match the ADR');
        },

        'issueHeader() sets every required attribute, and never a Domain attribute' => function () {
            $cookie = new WebSessionCookie(true);
            $header = $cookie->issueHeader('raw-session-token', new \DateTimeImmutable('2026-01-01T00:00:00+00:00'));

            assertTrue(str_contains($header, '__Host-tamamizu_session=raw-session-token'), 'must carry the cookie name and raw token value');
            assertTrue(str_contains($header, 'Secure'), 'must set Secure');
            assertTrue(str_contains($header, 'HttpOnly'), 'must set HttpOnly');
            assertTrue(str_contains($header, 'SameSite=Lax'), 'must set SameSite=Lax');
            assertTrue(str_contains($header, 'Path=/'), 'must set Path=/');
            assertTrue(str_contains($header, 'Expires=Thu, 01 Jan 2026 00:00:00 GMT'), 'must set Expires from the given expiry');
            assertFalse(str_contains($header, 'Domain='), 'must NEVER set a Domain attribute -- see the ADR\'s host-only decision');
        },

        'issueHeader() URL-encodes the token value' => function () {
            $cookie = new WebSessionCookie(true);
            $header = $cookie->issueHeader('a/b+c', new \DateTimeImmutable('2026-01-01T00:00:00+00:00'));
            assertFalse(str_contains($header, '=a/b+c;'), 'a raw token containing cookie-unsafe characters must be encoded, not embedded verbatim');
        },

        'deleteHeader() expires immediately with an empty value, and still no Domain attribute' => function () {
            $cookie = new WebSessionCookie(true);
            $header = $cookie->deleteHeader();

            assertTrue(str_contains($header, '__Host-tamamizu_session='), 'must target the same cookie name');
            assertTrue(str_contains($header, 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'), 'must expire in the past');
            assertFalse(str_contains($header, 'Domain='), 'deleteHeader() must never set a Domain attribute either');
        },

        'readToken() returns the cookie value when enabled' => function () {
            $cookie = new WebSessionCookie(true);
            assertSame('abc123', $cookie->readToken(['__Host-tamamizu_session' => 'abc123']), 'should read the configured cookie name');
        },

        'readToken() returns null when disabled, even if the cookie is present' => function () {
            $cookie = new WebSessionCookie(false);
            assertSame(null, $cookie->readToken(['__Host-tamamizu_session' => 'abc123']), 'disabled mode must ignore any incoming cookie entirely');
        },

        'readToken() returns null when the cookie is missing or empty' => function () {
            $cookie = new WebSessionCookie(true);
            assertSame(null, $cookie->readToken([]), 'missing cookie must resolve to null');
            assertSame(null, $cookie->readToken(['__Host-tamamizu_session' => '']), 'empty cookie value must resolve to null, not an empty-string token');
        },

        'a custom cookie name is honored for both issuing and reading' => function () {
            $cookie = new WebSessionCookie(true, 'custom_name');
            $header = $cookie->issueHeader('tok', new \DateTimeImmutable('2026-01-01T00:00:00+00:00'));
            assertTrue(str_contains($header, 'custom_name=tok'), 'issueHeader() must use the configured name');
            assertSame('tok', $cookie->readToken(['custom_name' => 'tok']), 'readToken() must use the configured name');
            assertSame(null, $cookie->readToken(['__Host-tamamizu_session' => 'tok']), 'the default name must not be read when a custom name is configured');
        },

        'isEnabled() reflects the constructor flag' => function () {
            assertTrue((new WebSessionCookie(true))->isEnabled(), 'enabled flag should read back true');
            assertFalse((new WebSessionCookie(false))->isEnabled(), 'enabled flag should read back false');
        },
    ];
}
