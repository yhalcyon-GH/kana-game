/**
 * Development-only API base URL for the Phase 3A auth/purchase/
 * entitlement endpoints (server/auth/*.php, server/purchase-intent.php,
 * server/entitlement-me.php, server/dev-only/last-magic-link.php).
 * Left unset by default; set VITE_PADDLE_AUTH_API_BASE_URL in
 * .env.local once a real deployment of these endpoints exists (see
 * docs/paddle-auth-phase3a-pr-c.md), matching the existing
 * VITE_PADDLE_ENTITLEMENT_API_URL convention from Phase 2's
 * PaddleTestPage. Never read outside import.meta.env.DEV.
 */
export function readAuthApiBase(): string | undefined {
  if (!import.meta.env.DEV) return undefined
  const raw = import.meta.env.VITE_PADDLE_AUTH_API_BASE_URL?.trim()
  if (!raw) return undefined
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}
