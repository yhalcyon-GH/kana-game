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
    /**
     * @param list<string> $allowedOrigins
     */
    public function __construct(private readonly array $allowedOrigins)
    {
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
        header('Access-Control-Allow-Origin: ' . $requestOrigin);
        header('Vary: Origin');
    }
}
