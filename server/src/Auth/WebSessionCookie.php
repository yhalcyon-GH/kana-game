<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Builds/reads the Production Web session cookie described in
 * docs/adr/0001-cross-site-auth-transport.md. Pure value logic only —
 * callers pass in `$_COOKIE` and send the built `Set-Cookie` header
 * value themselves via PHP's own `header()`, matching the seam already
 * used by Cors (see Cors.php's own doc comment on why: this repo's CLI
 * test-runner SAPI can't observe real header() calls, so all
 * assertable behavior lives in a plain, directly-testable value here).
 *
 * The cookie is ALWAYS built with these fixed attributes, never
 * configurable per the ADR's decision:
 *   - Secure
 *   - HttpOnly
 *   - SameSite=Lax
 *   - Path=/
 *   - NO Domain attribute (host-only -- see the ADR's "Host-only, not
 *     domain-wide" section). The default cookie name additionally
 *     carries the `__Host-` prefix, which the browser itself refuses
 *     to accept unless Domain is absent, Path=/, and Secure is set --
 *     turning "no Domain attribute" into something enforced by the
 *     browser, not just remembered by this code.
 *
 * `$enabled` gates everything: when false (the default -- see
 * WEB_SESSION_COOKIE_ENABLED in server/config.example.php), readToken()
 * always returns null regardless of what's actually in $_COOKIE, so
 * existing Sandbox/dev-harness Bearer-only behavior is completely
 * unaffected by a stray cookie ever being present.
 */
final class WebSessionCookie
{
    public const DEFAULT_NAME = '__Host-tamamizu_session';

    public function __construct(
        private readonly bool $enabled,
        private readonly string $cookieName = self::DEFAULT_NAME,
    ) {
    }

    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    public function cookieName(): string
    {
        return $this->cookieName;
    }

    /**
     * The `Set-Cookie` header value that issues a session. Callers are
     * responsible for calling header('Set-Cookie: ' . $this, false) --
     * this class never calls header() itself (see class doc comment).
     */
    public function issueHeader(string $rawSessionToken, \DateTimeImmutable $expiresAt): string
    {
        return $this->buildHeader($rawSessionToken, $expiresAt);
    }

    /**
     * The `Set-Cookie` header value that deletes/expires the cookie
     * (an empty value with an already-past Expires) -- used on logout.
     */
    public function deleteHeader(): string
    {
        return $this->buildHeader('', new \DateTimeImmutable('@0'));
    }

    /**
     * @param array<string, mixed> $cookies Typically $_COOKIE.
     */
    public function readToken(array $cookies): ?string
    {
        if (!$this->enabled) {
            return null;
        }
        $value = $cookies[$this->cookieName] ?? null;
        return is_string($value) && $value !== '' ? $value : null;
    }

    private function buildHeader(string $value, \DateTimeImmutable $expiresAt): string
    {
        $attributes = [
            $this->cookieName . '=' . rawurlencode($value),
            'Expires=' . $expiresAt->setTimezone(new \DateTimeZone('UTC'))->format('D, d M Y H:i:s') . ' GMT',
            'Path=/',
            'Secure',
            'HttpOnly',
            'SameSite=Lax',
        ];

        return implode('; ', $attributes);
    }
}
