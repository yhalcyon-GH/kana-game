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
  // Phase H2: the caller's configured environment (sandbox/live) did not
  // match the server's own authoritative PADDLE_ENVIRONMENT -- either the
  // server rejected the request outright (409/400), or the server DID
  // return 200 but the response's own `environment` field didn't match
  // what we asserted (defense-in-depth re-check, never trust a 200 blindly).
  | { kind: 'environment-mismatch' }

export type LogoutResult =
  | { kind: 'signed-out' }
  | { kind: 'unavailable' }

export type CapabilitiesResult =
  | { kind: 'available'; emailCodeAuth: boolean }
  // Absent/malformed/unreachable all fold into the SAME fallback signal --
  // see the design spec: a GitHub-Pages-ahead-of-backend deploy (or any
  // other reason this probe can't be trusted) must fall back to Magic
  // Link, never block sign-in outright.
  | { kind: 'unavailable' }

export type RequestLoginCodeResult =
  // A challenge was issued -- the frontend can move to the code-entry step.
  | { kind: 'issued'; challenge: string }
  // Enumeration-safe by design (see request-code.php): malformed email,
  // rate-limiting, and "no challenge for another reason" are all
  // indistinguishable here, matching the backend's own contract.
  | { kind: 'not-issued' }
  | { kind: 'unavailable' }

export type VerifyLoginCodeResult =
  | { kind: 'authenticated'; user: CurrentUser }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }

export type SignOutOthersResult =
  | { kind: 'ok'; revoked: number }
  | { kind: 'signed-out' }
  // Authenticated, but this browser has no persistent ("remember me")
  // credential of its own to keep -- see sign-out-others.php's 400.
  | { kind: 'no-persistent-session' }
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
      credentials: 'include',
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

/**
 * The server selects the user and product from its cookie-authenticated
 * session. `environment` is this caller's own configured Paddle
 * environment ('sandbox' | 'live') -- sent as an ASSERTION the server
 * checks against its own authoritative PADDLE_ENVIRONMENT, never as a
 * selector. See docs/paddle-environment-separation.md and
 * server/src/Purchase/PurchaseIntentEndpoint.php.
 *
 * A server-side 409 (or any non-200 the environment check could cause)
 * surfaces as 'environment-mismatch', and even a 200 response is
 * re-checked locally: `body.environment` must equal the `environment`
 * we asserted before purchaseRef is ever trusted/returned. Never assume
 * a 200 means "environments agreed" without checking -- always confirm.
 */
export async function createPurchaseIntent(apiBase: string, environment: string): Promise<PurchaseIntentResult> {
  try {
    const response = await fetch(`${apiBase}/purchase-intent.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment }),
    })
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 400 || response.status === 409) return { kind: 'environment-mismatch' }
    if (!response.ok) return { kind: 'unavailable' }

    const body = (await safeJson(response)) as { purchase_ref?: unknown; environment?: unknown } | null
    if (typeof body?.purchase_ref !== 'string' || body.purchase_ref.trim().length === 0) {
      return { kind: 'unavailable' }
    }
    if (body.environment !== environment) {
      return { kind: 'environment-mismatch' }
    }
    return { kind: 'created', purchaseRef: body.purchase_ref }
  } catch {
    return { kind: 'unavailable' }
  }
}

/**
 * The browser owns the Production Web credential, so the UI must not claim
 * sign-out until the server confirms the revoke/idempotent-no-session path.
 * In particular, logout.php intentionally returns non-2xx when it could not
 * safely revoke the session; a network failure is equally unconfirmed.
 */
export async function logout(apiBase: string): Promise<LogoutResult> {
  try {
    const response = await fetch(`${apiBase}/auth/logout.php`, { method: 'POST', credentials: 'include' })
    return response.ok ? { kind: 'signed-out' } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}

/**
 * Public, unauthenticated probe -- no credentials needed (see
 * server/auth/capabilities.php). Any non-200 or network failure is
 * 'unavailable', which the caller must treat exactly like
 * `emailCodeAuth: false` (fall back to Magic Link) -- never block sign-in
 * on this probe failing.
 */
export async function fetchAuthCapabilities(apiBase: string): Promise<CapabilitiesResult> {
  try {
    const response = await fetch(`${apiBase}/auth/capabilities.php`)
    if (!response.ok) return { kind: 'unavailable' }

    const body = (await safeJson(response)) as { email_code_auth?: unknown } | null
    if (typeof body?.email_code_auth !== 'boolean') return { kind: 'unavailable' }
    return { kind: 'available', emailCodeAuth: body.email_code_auth }
  } catch {
    return { kind: 'unavailable' }
  }
}

/**
 * request-code.php's own contract is enumeration-safe: a malformed email
 * or a rate-limited request both come back 200 with NO `challenge` key,
 * indistinguishable from each other here (see that file's own doc
 * comment) -- this wrapper preserves that, folding both into 'not-issued'.
 */
export async function requestLoginCode(apiBase: string, email: string): Promise<RequestLoginCodeResult> {
  try {
    const response = await fetch(`${apiBase}/auth/request-code.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!response.ok) return { kind: 'unavailable' }

    const body = (await safeJson(response)) as { challenge?: unknown } | null
    if (typeof body?.challenge !== 'string' || body.challenge === '') return { kind: 'not-issued' }
    return { kind: 'issued', challenge: body.challenge }
  } catch {
    return { kind: 'unavailable' }
  }
}

/**
 * POSTs the opaque challenge token and the (possibly leading-zero) code
 * as strings, with `credentials: 'include'` so the server's session AND
 * remember-me Set-Cookie headers are actually stored by the browser. A
 * wrong/expired code is reported as 'invalid' -- callers must NEVER fall
 * back to Magic Link on this outcome (only on 'unavailable', which means
 * the OTP path itself could not be reached at all).
 */
export async function verifyLoginCode(apiBase: string, challenge: string, code: string): Promise<VerifyLoginCodeResult> {
  try {
    const response = await fetch(`${apiBase}/auth/verify-code.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, code }),
    })
    if (response.status === 400) return { kind: 'invalid' }
    if (!response.ok) return { kind: 'unavailable' }

    const body = (await safeJson(response)) as { user?: { user_id?: unknown; email_normalized?: unknown } } | null
    if (typeof body?.user?.user_id !== 'string' || typeof body.user?.email_normalized !== 'string') {
      return { kind: 'unavailable' }
    }
    return { kind: 'authenticated', user: { userId: body.user.user_id, emailNormalized: body.user.email_normalized } }
  } catch {
    return { kind: 'unavailable' }
  }
}

/**
 * Revokes every OTHER persistent ("remember this browser") credential for
 * the current user, keeping only the one tied to this browser's own
 * remember cookie -- see server/auth/sign-out-others.php.
 */
export async function signOutOtherBrowsers(apiBase: string): Promise<SignOutOthersResult> {
  try {
    const response = await fetch(`${apiBase}/auth/sign-out-others.php`, { method: 'POST', credentials: 'include' })
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 400) return { kind: 'no-persistent-session' }
    if (!response.ok) return { kind: 'unavailable' }

    const body = (await safeJson(response)) as { revoked?: unknown } | null
    if (typeof body?.revoked !== 'number') return { kind: 'unavailable' }
    return { kind: 'ok', revoked: body.revoked }
  } catch {
    return { kind: 'unavailable' }
  }
}
