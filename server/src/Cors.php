<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Allowlist-based CORS for the entitlement read endpoint (the webhook
 * endpoint is never called cross-origin from a browser and does not need
 * CORS headers at all — only entitlement.php uses this).
 *
 * Never emits `Access-Control-Allow-Origin: *`. The allowed origins come
 * from server-side config (ALLOWED_ORIGINS, comma-separated — see
 * server/config.example.php), not a hardcoded list, so Xserver deployment
 * can add/remove origins without a code change.
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
     */
    public function __construct(private readonly array $allowedOrigins, ?callable $sendHeader = null)
    {
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
        if (!$this->isOriginAllowed($requestOrigin)) {
            return;
        }
        ($this->sendHeader)('Access-Control-Allow-Origin: ' . $requestOrigin);
        ($this->sendHeader)('Vary: Origin');
    }

    /**
     * Applies CORS headers for a preflight (OPTIONS) request from an
     * allowed origin — the new auth endpoints (server/auth/*.php) use
     * POST with a JSON body and/or an Authorization header, both of
     * which trigger a browser preflight. Emits the origin/Vary headers
     * (same as applyHeaders()) plus the specific method/header policy
     * those endpoints need. Never emits Access-Control-Allow-Credentials
     * — a production cookie transport is still deferred (see
     * docs/adr/0001-cross-site-auth-transport.md), and emitting that
     * header now would be a premature commitment this class does not
     * make. Does nothing for a disallowed origin, same as
     * applyHeaders().
     */
    public function applyPreflightHeaders(?string $requestOrigin): void
    {
        if (!$this->isOriginAllowed($requestOrigin)) {
            return;
        }
        ($this->sendHeader)('Access-Control-Allow-Origin: ' . $requestOrigin);
        ($this->sendHeader)('Vary: Origin');
        ($this->sendHeader)('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        ($this->sendHeader)('Access-Control-Allow-Headers: Content-Type, Authorization');
    }
}
