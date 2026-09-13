/**
 * Fetch wrappers for the Production Web auth flow — see
 * docs/adr/0001-cross-site-auth-transport.md. Every authenticated call
 * here uses `credentials: 'include'` and NEVER reads/writes an
 * Authorization header or any session token: the session lives only in
 * the browser-managed, HttpOnly `__Host-tamamizu_session` cookie (see
 * server/src/Auth/WebSessionCookie.php), which this code cannot read
 * even if it tried. This file is deliberately independent of
 * ../lib/auth/authClient.ts (the dev-only Bearer/InMemorySessionTransport
 * client) and of sessionTransport.ts -- Production Web has no client-
 * held credential to transport at all.
 */

export interface CurrentUser {
  userId: string
  emailNormalized: string
}

export interface CurrentEntitlement {
  active: boolean
}

export type CurrentUserResult =
  | { kind: 'authenticated'; user: CurrentUser }
  | { kind: 'signed-out' }
  | { kind: 'unavailable' }

export type CurrentEntitlementResult =
  | { kind: 'available'; entitlement: CurrentEntitlement }
  | { kind: 'signed-out' }
  | { kind: 'unavailable' }

export type PurchaseIntentResult =
  | { kind: 'created'; purchaseRef: string }
  | { kind: 'signed-out' }
  | { kind: 'unavailable' }

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * request-link.php's own contract is "always 200, never distinguish
 * failure reasons" (enumeration-safe) -- this wrapper preserves that by
 * never surfacing a distinguishable error for any failure mode,
 * matching the dev harness's identical choice in authClient.ts.
 */
export async function requestMagicLink(apiBase: string, email: string): Promise<void> {
  try {
    await fetch(`${apiBase}/auth/request-link.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch {
    // Network failure is treated the same as any other outcome here --
    // the UI just tells the user to check their email either way.
  }
}

/**
 * POSTs the raw magic-link token to verify.php in the REQUEST BODY,
 * never a query string, with `credentials: 'include'` so the server's
 * Set-Cookie response is actually stored by the browser. Returns the
 * user info on success -- there is no session token to return: in
 * cookie mode, verify.php never places one in the response body (see
 * server/auth/verify.php).
 */
export async function verifyMagicLinkToken(apiBase: string, rawToken: string): Promise<CurrentUser | null> {
  try {
    const response = await fetch(`${apiBase}/auth/verify.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    })
    if (!response.ok) return null

    const body = (await safeJson(response)) as { user?: { user_id?: unknown; email_normalized?: unknown } } | null
    if (typeof body?.user?.user_id !== 'string' || typeof body.user?.email_normalized !== 'string') return null

    return { userId: body.user.user_id, emailNormalized: body.user.email_normalized }
  } catch {
    return null
  }
}

export async function fetchCurrentUser(apiBase: string): Promise<CurrentUser | null> {
  const result = await fetchCurrentUserResult(apiBase)
  return result.kind === 'authenticated' ? result.user : null
}

export async function fetchCurrentUserResult(apiBase: string): Promise<CurrentUserResult> {
  try {
    const response = await fetch(`${apiBase}/auth/me.php`, { credentials: 'include' })
    if (response.status === 401) return { kind: 'signed-out' }
    if (!response.ok) return { kind: 'unavailable' }

    const body = (await safeJson(response)) as { user_id?: unknown; email_normalized?: unknown } | null
    if (typeof body?.user_id !== 'string' || typeof body.email_normalized !== 'string') return { kind: 'unavailable' }

    return { kind: 'authenticated', user: { userId: body.user_id, emailNormalized: body.email_normalized } }
  } catch {
    return { kind: 'unavailable' }
  }
}

export async function fetchCurrentEntitlement(apiBase: string): Promise<CurrentEntitlement | null> {
  const result = await fetchCurrentEntitlementResult(apiBase)
  return result.kind === 'available' ? result.entitlement : null
}

export async function fetchCurrentEntitlementResult(apiBase: string): Promise<CurrentEntitlementResult> {
  try {
    const response = await fetch(`${apiBase}/entitlement-me.php`, { credentials: 'include' })
    if (response.status === 401) return { kind: 'signed-out' }
    if (!response.ok) return { kind: 'unavailable' }

    const body = (await safeJson(response)) as { active?: unknown } | null
    if (typeof body?.active !== 'boolean') return { kind: 'unavailable' }
    return { kind: 'available', entitlement: { active: body.active } }
  } catch {
    return { kind: 'unavailable' }
  }
}

/** The server selects the user and product from its cookie-authenticated session. */
export async function createPurchaseIntent(apiBase: string): Promise<PurchaseIntentResult> {
  try {
    const response = await fetch(`${apiBase}/purchase-intent.php`, {
      method: 'POST',
      credentials: 'include',
    })
    if (response.status === 401) return { kind: 'signed-out' }
    if (!response.ok) return { kind: 'unavailable' }

    const body = (await safeJson(response)) as { purchase_ref?: unknown } | null
    if (typeof body?.purchase_ref !== 'string' || body.purchase_ref.trim().length === 0) {
      return { kind: 'unavailable' }
    }
    return { kind: 'created', purchaseRef: body.purchase_ref }
  } catch {
    return { kind: 'unavailable' }
  }
}

export async function logout(apiBase: string): Promise<void> {
  try {
    await fetch(`${apiBase}/auth/logout.php`, { method: 'POST', credentials: 'include' })
  } catch {
    // Best-effort -- there is no client-held credential to clear
    // locally regardless of whether the server request succeeded; the
    // browser drops the (already server-expired) cookie on its own.
  }
}
