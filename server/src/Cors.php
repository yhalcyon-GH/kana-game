<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Allowlist-based CORS plus baseline browser-response hardening for the
 * public JSON API entrypoints that construct this class.
 *
 * Never emits `Access-Control-Allow-Origin: *`. The allowed origins come
 * from server-side config (ALLOWED_ORIGINS, comma-separated — see
 * server/config.example.php), not a hardcoded list, so XServer deployment
 * can add/remove origins without a code change.
 *
 * The baseline security headers are emitted independently of whether the
 * request Origin is allowlisted: CORS controls which browser origin can read
 * the response, while nosniff/frame/referrer/permissions/CSP are response
 * hardening and should also cover same-origin, no-Origin, and rejected-origin
 * requests. HSTS is intentionally NOT set here because transport security is
 * terminated by the hosting layer and this application has no trusted-proxy
 * configuration with which to distinguish HTTPS from spoofable forwarded
 * headers. HSTS remains a hosting-level Human Gate.
 */
final class Cors
{
    /** @var callable(string): void */
    private $sendHeader;

    /**
     * @param list<string> $allowedOrigins
     * @param (callable(string): void)|null $sendHeader Defaults to PHP's
     *   real header() function. Overridable only for tests — PHP's CLI
     *   SAPI (used by server/tests/run-tests.php) does not record
     *   header() calls via headers_list() the way a real web server
     *   does, so server/tests/CorsTest.php injects a recording closure
     *   here to observe what would have been sent. Production code
     *   never passes this argument.
     * @param bool $credentialed When true, emits
     *   `Access-Control-Allow-Credentials: true` alongside the exact
     *   origin (never a wildcard — Access-Control-Allow-Origin already
     *   never is one). Callers pass this as exactly
     *   `$config->get('WEB_SESSION_COOKIE_ENABLED') === 'true'` (see
     *   docs/adr/0001-cross-site-auth-transport.md) so a deployment with
     *   cookie mode off — the default, including every Sandbox/dev
     *   deployment — emits IDENTICAL CORS headers to before Phase 3B.
     *   Emitting this header has no effect on requests that don't send
     *   `credentials: 'include'` (the existing Bearer-only dev harness);
     *   it only permits a browser to actually read the response for a
     *   fetch that DOES include credentials, which the Production Web
     *   cookie transport requires.
     */
    public function __construct(
        private readonly array $allowedOrigins,
        ?callable $sendHeader = null,
        private readonly bool $credentialed = false,
    ) {
        $this->sendHeader = $sendHeader ?? static function (string $header): void {
            header($header);
        };
    }

    /**
     * Pure decision logic, exposed separately from applyHeaders() so it's
     * testable without a real HTTP response context (see
     * server/tests/CorsTest.php). Never treats a "*" allowlist entry as a
     * wildcard match — membership is always an exact, case-sensitive
     * string match against the configured list.
     */
    public function isOriginAllowed(?string $requestOrigin): bool
    {
        if ($requestOrigin === null || $requestOrigin === '') {
            return false;
        }
        return in_array($requestOrigin, $this->allowedOrigins, true);
    }

    /**
     * Applies the appropriate CORS header for the given request Origin, if
     * it's on the allowlist. Call before any output. Safe to call with a
     * null/empty origin (same-origin or non-browser requests) — it simply
     * does nothing in that case.
     */
    public function applyHeaders(?string $requestOrigin): void
    {
        $this->applyBaselineSecurityHeaders();
        if (!$this->isOriginAllowed($requestOrigin)) {
            return;
        }
        ($this->sendHeader)('Access-Control-Allow-Origin: ' . $requestOrigin);
        ($this->sendHeader)('Vary: Origin');
        if ($this->credentialed) {
            ($this->sendHeader)('Access-Control-Allow-Credentials: true');
        }
    }

    /**
     * Applies CORS headers for a preflight (OPTIONS) request from an
     * allowed origin — the new auth endpoints (server/auth/*.php) use
     * POST with a JSON body and/or an Authorization header, both of
     * which trigger a browser preflight. Emits the origin/Vary headers
     * (same as applyHeaders()) plus the specific method/header policy
     * those endpoints need. Emits Access-Control-Allow-Credentials only
     * when constructed with $credentialed = true (see the constructor's
     * doc comment) — a Sandbox/dev deployment with cookie mode off
     * never emits it, identical to Phase 3A's behavior. Does nothing
     * for a disallowed origin, same as applyHeaders().
     */
    public function applyPreflightHeaders(?string $requestOrigin): void
    {
        $this->applyBaselineSecurityHeaders();
        if (!$this->isOriginAllowed($requestOrigin)) {
            return;
        }
        ($this->sendHeader)('Access-Control-Allow-Origin: ' . $requestOrigin);
        ($this->sendHeader)('Vary: Origin');
        ($this->sendHeader)('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        ($this->sendHeader)('Access-Control-Allow-Headers: Content-Type, Authorization');
        if ($this->credentialed) {
            ($this->sendHeader)('Access-Control-Allow-Credentials: true');
        }
    }

    private function applyBaselineSecurityHeaders(): void
    {
        ($this->sendHeader)('X-Content-Type-Options: nosniff');
        ($this->sendHeader)('X-Frame-Options: DENY');
        ($this->sendHeader)('Referrer-Policy: no-referrer');
        ($this->sendHeader)('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        ($this->sendHeader)("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    }
}
