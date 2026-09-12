<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Resolves a single, unambiguous raw session token from the two
 * credential sources an authenticated endpoint may see: the existing
 * `Authorization: Bearer` header (dev harness, tests, future
 * native/Android transport) and the Production Web session cookie (see
 * WebSessionCookie / docs/adr/0001-cross-site-auth-transport.md).
 *
 * Pure, stateless, and deliberately has no dependency on
 * CurrentUserService or the database -- it only decides WHICH raw token
 * string (if any) an endpoint should go on to resolve, never whether
 * that token is itself valid.
 */
final class SessionCredentialResolver
{
    /**
     * Extracts the raw token from an `Authorization: Bearer <token>`
     * header value. Returns null for a missing header, a header that
     * doesn't start with "Bearer ", or an empty token.
     */
    public static function extractBearerToken(?string $authorizationHeader): ?string
    {
        if ($authorizationHeader === null || !str_starts_with($authorizationHeader, 'Bearer ')) {
            return null;
        }
        $token = substr($authorizationHeader, strlen('Bearer '));
        return $token !== '' ? $token : null;
    }

    /**
     * Resolves the single raw session token an endpoint should use.
     *
     *   - Neither present -> null (unauthenticated).
     *   - Exactly one present -> that one.
     *   - Both present and EQUAL -> that token (harmless redundancy).
     *   - Both present and DIFFERENT -> null. This is a deliberate
     *     reject, not a guess: never implicitly prefer the Bearer
     *     header or the cookie. A caller sending two different
     *     credentials at once is exactly the ambiguous-credential shape
     *     an endpoint must never resolve to "whichever happens to be
     *     valid" -- collapsing this to the same null used for "no
     *     credential at all" also avoids confirming to a caller which
     *     of two credentials was the "real" one.
     */
    public static function resolve(?string $bearerToken, ?string $cookieToken): ?string
    {
        if ($bearerToken !== null && $cookieToken !== null) {
            return $bearerToken === $cookieToken ? $bearerToken : null;
        }

        return $bearerToken ?? $cookieToken;
    }
}
