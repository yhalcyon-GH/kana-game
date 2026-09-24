/**
 * Production API base URL for the Web auth endpoints (server/auth/*.php,
 * server/entitlement-me.php) — see docs/adr/0001-cross-site-auth-
 * transport.md. Unlike readAuthApiBase() (authApiBase.ts), this is
 * available in production builds, where the default keeps the deployed
 * login/account routes working without extra client configuration.
 * Development builds deliberately have no default: local development
 * may contact a Production Auth API only when the URL is explicitly set.
 *
 * Not a secret — this is the same public API host already used by the
 * dev-only harness and by Phase 2's entitlement PoC, just read via a
 * separate env var so the production routes never accidentally depend
 * on VITE_PADDLE_AUTH_API_BASE_URL (which is explicitly dev-only and
 * intentionally unset in production builds, per that file's own doc
 * comment).
 */
const PRODUCTION_AUTH_API_BASE = 'https://tamamizu.giganihongo.com/api'

function normalizeTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function readProductionAuthApiBase(): string | undefined {
  const raw = import.meta.env.VITE_PRODUCTION_AUTH_API_BASE_URL?.trim()
  if (!raw) {
    return import.meta.env.DEV ? undefined : PRODUCTION_AUTH_API_BASE
  }

  const base = normalizeTrailingSlash(raw)

  if (import.meta.env.DEV) {
    return base
  }

  // Production must never silently send auth/session traffic to an
  // explicitly configured origin/path/scheme/port other than the
  // canonical API base: fail closed instead of trusting build config.
  return base === PRODUCTION_AUTH_API_BASE ? base : undefined
}
