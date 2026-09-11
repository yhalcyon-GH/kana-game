/**
 * Shared Paddle Sandbox client-side config validation — used by both the
 * Phase 2 PoC (/paddle-test) and the Phase 3A real-user harness
 * (/account-test's Sandbox Checkout section). Extracted so the two
 * pages can never drift on what counts as valid Sandbox config; DEV-only
 * for both call sites, and the price/token shape checks are identical.
 */

export type SandboxConfigResult = { error: string } | { token: string; priceId: string }

export function readSandboxConfig(disabledMessage: string): SandboxConfigResult {
  if (!import.meta.env.DEV) return { error: disabledMessage }

  const environment = import.meta.env.VITE_PADDLE_ENVIRONMENT?.trim()
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim()
  const priceId = import.meta.env.VITE_PADDLE_PRICE_ID?.trim()
  const missing = [
    !environment && 'VITE_PADDLE_ENVIRONMENT',
    !token && 'VITE_PADDLE_CLIENT_TOKEN',
    !priceId && 'VITE_PADDLE_PRICE_ID',
  ].filter(Boolean)

  if (missing.length) {
    return { error: `Configuration missing: ${missing.join(', ')}. Set these in .env.local and restart the dev server.` }
  }
  if (environment !== 'sandbox') return { error: 'VITE_PADDLE_ENVIRONMENT must be sandbox for this PoC.' }
  if (!token?.startsWith('test_')) {
    return { error: 'VITE_PADDLE_CLIENT_TOKEN must be a sandbox client-side token (test_). Never use an API key.' }
  }
  if (!priceId?.startsWith('pri_')) return { error: 'VITE_PADDLE_PRICE_ID must be a Paddle price ID (pri_).' }
  return { token, priceId }
}
