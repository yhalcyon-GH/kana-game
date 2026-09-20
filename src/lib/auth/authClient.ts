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

/**
 * `environment` is this (dev-only) caller's own configured Paddle
 * environment -- asserted so the server can refuse a mismatch against
 * its own authoritative PADDLE_ENVIRONMENT, matching
 * productionAuthClient.ts's createPurchaseIntent(). See
 * docs/paddle-environment-separation.md.
 */
export async function createPurchaseIntent(apiBase: string, environment: string): Promise<string | null> {
  const token = inMemorySessionTransport.getToken()
  if (!token) return null

  try {
    const response = await fetch(`${apiBase}/purchase-intent.php`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment }),
    })
    if (!response.ok) return null

    const body = (await safeJson(response)) as { purchase_ref?: unknown; environment?: unknown } | null
    if (typeof body?.purchase_ref !== 'string' || body.environment !== environment) return null
    return body.purchase_ref
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
 *
 * POST + a JSON body (Issue #360), not GET + a query string -- the
 * server now requires this so a cross-site request can never reach the
 * server and burn the pending link as a side effect (a plain GET was a
 * CORS "simple request": CORS stopped an attacker from reading the
 * response, but never stopped the request from arriving and consuming
 * the row). See server/dev-only/last-magic-link.php's own doc comment.
 */
export async function fetchDevHarnessMagicLink(apiBase: string, emailNormalized: string): Promise<string | null> {
  try {
    const response = await fetch(`${apiBase}/dev-only/last-magic-link.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailNormalized }),
    })
    if (!response.ok) return null

    const body = (await safeJson(response)) as { magic_link_url?: unknown } | null
    return typeof body?.magic_link_url === 'string' ? body.magic_link_url : null
  } catch {
    return null
  }
}

/**
 * Requests a 6-digit email sign-in code (server/auth/request-code.php).
 * Only ever meaningful when the backend has EMAIL_CODE_AUTH_ENABLED and
 * DEV_HARNESS_ENABLED both true -- otherwise this harness's own
 * fetchDevHarnessLoginCode() below will never find a pending code.
 */
export async function requestLoginCode(apiBase: string, email: string): Promise<string | null> {
  try {
    const response = await fetch(`${apiBase}/auth/request-code.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!response.ok) return null

    const body = (await safeJson(response)) as { challenge?: unknown } | null
    return typeof body?.challenge === 'string' ? body.challenge : null
  } catch {
    return null
  }
}

/**
 * Consumes a 6-digit email OTP code (server/auth/verify-code.php). Bearer
 * mode only, matching this file's own scope -- see VerifyResult and
 * verifyMagicLinkToken() above.
 */
export async function verifyLoginCode(apiBase: string, challenge: string, code: string): Promise<VerifyResult | null> {
  try {
    const response = await fetch(`${apiBase}/auth/verify-code.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, code }),
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

/**
 * DEV-ONLY. Retrieves (and consumes) the most recently issued 6-digit
 * email sign-in code for an email from server/dev-only/last-login-code.php
 * -- the OTP equivalent of fetchDevHarnessMagicLink() above. Returns null
 * when the harness is disabled (403) or no code is pending (404) -- both
 * unremarkable, expected states for this harness, not errors. Exists
 * solely so the /account-test harness and automated dev/Sandbox browser
 * smoke can exercise the OTP flow end to end without real email delivery.
 *
 * POST + a JSON body (Issue #360), not GET + a query string -- see
 * fetchDevHarnessMagicLink() above and server/dev-only/last-login-code.php's
 * own doc comment for why.
 */
export async function fetchDevHarnessLoginCode(apiBase: string, emailNormalized: string): Promise<string | null> {
  try {
    const response = await fetch(`${apiBase}/dev-only/last-login-code.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailNormalized }),
    })
    if (!response.ok) return null

    const body = (await safeJson(response)) as { login_code?: unknown } | null
    return typeof body?.login_code === 'string' ? body.login_code : null
  } catch {
    return null
  }
}
