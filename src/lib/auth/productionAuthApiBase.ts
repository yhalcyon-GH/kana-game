/**
 * Production API base URL for the Web auth endpoints (server/auth/*.php,
 * server/entitlement-me.php) — see docs/adr/0001-cross-site-auth-
 * transport.md. Unlike readAuthApiBase() (authApiBase.ts), this is
 * available in EVERY build, not gated on import.meta.env.DEV: the
 * Production Web login/account routes must work in the actual deployed
 * production build, not only in local development.
 *
 * Not a secret — this is the same public API host already used by the
 * dev-only harness and by Phase 2's entitlement PoC, just read via a
 * separate env var so the production routes never accidentally depend
 * on VITE_PADDLE_AUTH_API_BASE_URL (which is explicitly dev-only and
 * intentionally unset in production builds, per that file's own doc
 * comment).
 */
export function readProductionAuthApiBase(): string {
  const raw = import.meta.env.VITE_PRODUCTION_AUTH_API_BASE_URL?.trim()
  const base = raw && raw !== '' ? raw : 'https://tamamizu.giganihongo.com/api'
  return base.endsWith('/') ? base.slice(0, -1) : base
}
