import { inMemorySessionTransport } from './sessionTransport'

/**
 * Thin fetch wrappers for the Phase 3A auth/purchase/entitlement
 * endpoints (server/auth/*.php, server/purchase-intent.php,
 * server/entitlement-me.php). Used ONLY by the dev-only /account-test
 * harness and its /verify route — see docs/adr/0001-cross-site-auth-
 * transport.md for why the production browser session transport
 * remains a separate, later decision.
 *
 * The session token is read/written exclusively through
 * inMemorySessionTransport — never localStorage/sessionStorage, never
 * placed in a URL. Every function here fails soft (returns null)
 * rather than throwing, so the harness UI can render a recoverable
 * error state instead of crashing.
 */

export interface CurrentUser {
  userId: string
  emailNormalized: string
}

export interface VerifyResult {
  sessionToken: string
  userId: string
  emailNormalized: string
}

export interface CurrentEntitlement {
  active: boolean
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function requestMagicLink(apiBase: string, email: string): Promise<void> {
  try {
    await fetch(`${apiBase}/auth/request-link.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch {
    // request-link.php's own contract is "always 200, never distinguish
    // failure reasons" -- a network failure here is treated the same
    // way: the harness UI just tells the user to check for a link.
  }
}

/**
 * POSTs the raw magic-link token to verify.php in the REQUEST BODY,
 * never a query string. Returns null (never throws) for an invalid/
 * expired token or a network failure -- the caller renders a
 * recoverable error state either way, with no distinguishable reason
 * surfaced (matching verify.php's own generic-error contract).
 */
export async function verifyMagicLinkToken(apiBase: string, rawToken: string): Promise<VerifyResult | null> {
  try {
    const response = await fetch(`${apiBase}/auth/verify.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    })
    if (!response.ok) return null

    const body = (await safeJson(response)) as { session_token?: unknown; user?: { user_id?: unknown; email_normalized?: unknown } } | null
    if (
      typeof body?.session_token !== 'string' ||
      typeof body.user?.user_id !== 'string' ||
      typeof body.user?.email_normalized !== 'string'
    ) {
      return null
    }

    return { sessionToken: body.session_token, userId: body.user.user_id, emailNormalized: body.user.email_normalized }
  } catch {
    return null
  }
}

export async function fetchCurrentUser(apiBase: string): Promise<CurrentUser | null> {
  const token = inMemorySessionTransport.getToken()
  if (!token) return null

  try {
    const response = await fetch(`${apiBase}/auth/me.php`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null

    const body = (await safeJson(response)) as { user_id?: unknown; email_normalized?: unknown } | null
    if (typeof body?.user_id !== 'string' || typeof body.email_normalized !== 'string') return null

    return { userId: body.user_id, emailNormalized: body.email_normalized }
  } catch {
    return null
  }
}

export async function createPurchaseIntent(apiBase: string): Promise<string | null> {
  const token = inMemorySessionTransport.getToken()
  if (!token) return null

  try {
    const response = await fetch(`${apiBase}/purchase-intent.php`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null

    const body = (await safeJson(response)) as { purchase_ref?: unknown } | null
    return typeof body?.purchase_ref === 'string' ? body.purchase_ref : null
  } catch {
    return null
  }
}

export async function fetchCurrentEntitlement(apiBase: string): Promise<CurrentEntitlement | null> {
  const token = inMemorySessionTransport.getToken()
  if (!token) return null

  try {
    const response = await fetch(`${apiBase}/entitlement-me.php`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null

    const body = (await safeJson(response)) as { active?: unknown } | null
    return { active: body?.active === true }
  } catch {
    return null
  }
}

export async function logout(apiBase: string): Promise<void> {
  const token = inMemorySessionTransport.getToken()
  if (token) {
    try {
      await fetch(`${apiBase}/auth/logout.php`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // Best-effort: clear the local session regardless of whether the
      // server-side revoke request itself succeeded or failed.
    }
  }
  inMemorySessionTransport.clear()
}

/**
 * DEV-ONLY. Retrieves the most recently issued magic link for an email
 * from server/dev-only/last-magic-link.php. Returns null when the
 * harness is disabled (403) or no link is pending (404) -- both are
 * unremarkable, expected states for this harness, not errors.
 */
export async function fetchDevHarnessMagicLink(apiBase: string, emailNormalized: string): Promise<string | null> {
  try {
    const url = `${apiBase}/dev-only/last-magic-link.php?email=${encodeURIComponent(emailNormalized)}`
    const response = await fetch(url)
    if (!response.ok) return null

    const body = (await safeJson(response)) as { magic_link_url?: unknown } | null
    return typeof body?.magic_link_url === 'string' ? body.magic_link_url : null
  } catch {
    return null
  }
}
