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
export function readProductionAuthApiBase(): string | undefined {
  const raw = import.meta.env.VITE_PRODUCTION_AUTH_API_BASE_URL?.trim()
  if (!raw) {
    return import.meta.env.DEV ? undefined : 'https://tamamizu.giganihongo.com/api'
  }

  const base = raw
  return base.endsWith('/') ? base.slice(0, -1) : base
}
