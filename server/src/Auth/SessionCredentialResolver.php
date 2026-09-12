<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

// Hard dependency, required here (not just `use`d) so every entrypoint
// that requires THIS file transitively gets SessionCredentialResolution
// too, regardless of whether it happens to require it separately --
// see the RefundCompleteness production incident (require-missing bug
// on server/paddle-webhook.php, fixed in an earlier PR) for exactly why
// a bare `use` statement is not enough in this codebase (no autoloader
// is registered).
require_once __DIR__ . '/SessionCredentialResolution.php';

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
     *   - Neither present -> SessionCredentialResolution::none().
     *   - Exactly one present -> ::resolved() with that token.
     *   - Both present and EQUAL -> ::resolved() with that token
     *     (harmless redundancy).
     *   - Both present and DIFFERENT -> ::ambiguous(), never a token.
     *     This is a deliberate reject, not a guess: never implicitly
     *     prefer the Bearer header or the cookie. A caller sending two
     *     different credentials at once is exactly the shape an
     *     endpoint must never resolve to "whichever happens to be
     *     valid."
     *
     * Returning a distinct ambiguous() result (rather than folding it
     * into the same null used for "no credential at all") exists
     * because at least one caller (auth/logout.php) must NOT treat an
     * ambiguous pair the same as a genuinely absent credential -- see
     * SessionCredentialResolution's own doc comment.
     */
    public static function resolve(?string $bearerToken, ?string $cookieToken): SessionCredentialResolution
    {
        if ($bearerToken !== null && $cookieToken !== null) {
            return $bearerToken === $cookieToken
                ? SessionCredentialResolution::resolved($bearerToken)
                : SessionCredentialResolution::ambiguous();
        }

        $token = $bearerToken ?? $cookieToken;
        return $token !== null ? SessionCredentialResolution::resolved($token) : SessionCredentialResolution::none();
    }
}
