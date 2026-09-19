import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPurchaseIntent,
  fetchAuthCapabilities,
  fetchCurrentEntitlement,
  fetchCurrentEntitlementResult,
  fetchCurrentUser,
  fetchCurrentUserResult,
  logout,
  requestLoginCode,
  requestMagicLink,
  signOutOtherBrowsers,
  verifyLoginCode,
  verifyMagicLinkToken,
} from './productionAuthClient'

const API_BASE = 'https://api.example.com'

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('productionAuthClient', () => {
  it('creates a cookie-authenticated purchase intent, asserting its own environment, with no identity/product/Authorization', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ purchase_ref: 'raw-purchase-reference', environment: 'sandbox' }))
    expect(await createPurchaseIntent(API_BASE, 'sandbox')).toEqual({ kind: 'created', purchaseRef: 'raw-purchase-reference' })
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${API_BASE}/purchase-intent.php`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: 'sandbox' }),
    })
  })

  it('returns signed-out for an unauthenticated purchase intent response even if it contains a reference', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ purchase_ref: 'not-authorized' }, false, 401))
    expect(await createPurchaseIntent(API_BASE, 'sandbox')).toEqual({ kind: 'signed-out' })
  })

  it.each([400, 409])('returns environment-mismatch for purchase intent HTTP %s (server rejected the asserted environment)', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'environment mismatch' }, false, status))
    expect(await createPurchaseIntent(API_BASE, 'live')).toEqual({ kind: 'environment-mismatch' })
  })

  it.each([403, 429, 500])('returns unavailable for purchase intent HTTP %s', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ purchase_ref: 'not-created' }, false, status))
    expect(await createPurchaseIntent(API_BASE, 'sandbox')).toEqual({ kind: 'unavailable' })
  })

  it.each([null, {}, { purchase_ref: '' }, { purchase_ref: '   ' }, { purchase_ref: 42 }, { purchase_ref: false }, { purchase_ref: [] }])('rejects malformed purchase intent response %j', async (body) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body))
    expect(await createPurchaseIntent(API_BASE, 'sandbox')).toEqual({ kind: 'unavailable' })
  })

  it('returns environment-mismatch when a 200 response echoes a DIFFERENT environment than asserted -- never trust a 200 without re-checking', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ purchase_ref: 'raw-purchase-reference', environment: 'live' }))
    expect(await createPurchaseIntent(API_BASE, 'sandbox')).toEqual({ kind: 'environment-mismatch' })
  })

  it('returns unavailable for malformed JSON and network failures without exposing raw error details', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('raw-purchase-reference') } } as unknown as Response)
      .mockRejectedValueOnce(new Error('raw-purchase-reference'))
    expect(await createPurchaseIntent(API_BASE, 'sandbox')).toEqual({ kind: 'unavailable' })
    expect(await createPurchaseIntent(API_BASE, 'sandbox')).toEqual({ kind: 'unavailable' })
  })

  it('requestMagicLink() posts the email as JSON, no credentials needed (no session yet)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    await requestMagicLink(API_BASE, 'a@example.com')

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/auth/request-link.php`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'a@example.com' }) }),
    )
  })

  it('requestMagicLink() never throws on a network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    await expect(requestMagicLink(API_BASE, 'a@example.com')).resolves.toBeUndefined()
  })

  it('verifyMagicLinkToken() posts the token in the body with credentials: "include"', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ user: { user_id: 'u1', email_normalized: 'a@example.com' } }),
    )

    const result = await verifyMagicLinkToken(API_BASE, 'raw-magic-link-token')

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/auth/verify.php`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ token: 'raw-magic-link-token' }),
      }),
    )
    expect(result).toEqual({ userId: 'u1', emailNormalized: 'a@example.com' })
  })

  it('verifyMagicLinkToken() never reads or expects a session_token field', async () => {
    // Cookie mode never returns one (see server/auth/verify.php) --
    // this client must succeed purely from the `user` object.
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ user: { user_id: 'u1', email_normalized: 'a@example.com' } }),
    )
    const result = await verifyMagicLinkToken(API_BASE, 'tok')
    expect(result).not.toHaveProperty('sessionToken')
  })

  it('verifyMagicLinkToken() returns null for a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'invalid or expired token' }, false))
    expect(await verifyMagicLinkToken(API_BASE, 'bad-token')).toBeNull()
  })

  it('fetchCurrentUser() sends credentials: "include" and no Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ user_id: 'u1', email_normalized: 'a@example.com' }))

    const result = await fetchCurrentUser(API_BASE)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init).toMatchObject({ credentials: 'include' })
    expect((init?.headers as Record<string, string> | undefined)?.['Authorization']).toBeUndefined()
    expect(result).toEqual({ userId: 'u1', emailNormalized: 'a@example.com' })
  })

  it('fetchCurrentUser() returns null for a 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, false, 401))
    expect(await fetchCurrentUser(API_BASE)).toBeNull()
  })

  it('fetchCurrentUserResult() distinguishes signed-out from an unavailable API', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, false, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, false, 403))
      .mockResolvedValueOnce(jsonResponse({ error: 'server failure' }, false, 500))

    expect(await fetchCurrentUserResult(API_BASE)).toEqual({ kind: 'signed-out' })
    expect(await fetchCurrentUserResult(API_BASE)).toEqual({ kind: 'unavailable' })
    expect(await fetchCurrentUserResult(API_BASE)).toEqual({ kind: 'unavailable' })
  })

  it('fetchCurrentEntitlement() sends credentials: "include"', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ active: true }))
    const result = await fetchCurrentEntitlement(API_BASE)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init).toMatchObject({ credentials: 'include' })
    expect(result).toEqual({ active: true })
  })

  it('fetchCurrentEntitlementResult() distinguishes an expired session from an unavailable API', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, false, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, false, 403))
      .mockRejectedValueOnce(new Error('network down'))

    expect(await fetchCurrentEntitlementResult(API_BASE)).toEqual({ kind: 'signed-out' })
    expect(await fetchCurrentEntitlementResult(API_BASE)).toEqual({ kind: 'unavailable' })
    expect(await fetchCurrentEntitlementResult(API_BASE)).toEqual({ kind: 'unavailable' })
  })

  it('fetchCurrentEntitlementResult() treats a malformed successful response as unavailable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ active: 'yes' }))

    expect(await fetchCurrentEntitlementResult(API_BASE)).toEqual({ kind: 'unavailable' })
  })

  it('logout() posts with credentials: "include", no Authorization header, and confirms success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    const result = await logout(API_BASE)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect((init?.headers as Record<string, string> | undefined)?.['Authorization']).toBeUndefined()
    expect(result).toEqual({ kind: 'signed-out' })
  })

  it('logout() reports unavailable instead of pretending success on HTTP or network failure', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'temporary server error' }, false, 500))
      .mockRejectedValueOnce(new Error('network down'))

    await expect(logout(API_BASE)).resolves.toEqual({ kind: 'unavailable' })
    await expect(logout(API_BASE)).resolves.toEqual({ kind: 'unavailable' })
  })

  it('fetchAuthCapabilities() reads the public probe with no credentials', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ email_code_auth: true }))
    expect(await fetchAuthCapabilities(API_BASE)).toEqual({ kind: 'available', emailCodeAuth: true })
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/auth/capabilities.php`)
  })

  it.each([
    [false, 200, { email_code_auth: 'not-a-boolean' }],
    [false, 404, {}],
    [false, 500, {}],
  ])('fetchAuthCapabilities() treats malformed/failed responses as unavailable (ok=%s, status=%s)', async (ok, status, body) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body, ok as boolean, status as number))
    expect(await fetchAuthCapabilities(API_BASE)).toEqual({ kind: 'unavailable' })
  })

  it('fetchAuthCapabilities() treats a network failure as unavailable, never throwing', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    await expect(fetchAuthCapabilities(API_BASE)).resolves.toEqual({ kind: 'unavailable' })
  })

  it('requestLoginCode() posts the email with no credentials and returns the issued challenge', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ status: 'ok', challenge: 'opaque-challenge' }))
    expect(await requestLoginCode(API_BASE, 'a@example.com')).toEqual({ kind: 'issued', challenge: 'opaque-challenge' })
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/auth/request-code.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.com' }),
    })
  })

  it('requestLoginCode() reports not-issued for the enumeration-safe "no challenge" response, indistinguishable from rate-limiting', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    expect(await requestLoginCode(API_BASE, 'a@example.com')).toEqual({ kind: 'not-issued' })
  })

  it('requestLoginCode() reports unavailable for a non-ok response or network failure', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockRejectedValueOnce(new Error('network down'))
    expect(await requestLoginCode(API_BASE, 'a@example.com')).toEqual({ kind: 'unavailable' })
    expect(await requestLoginCode(API_BASE, 'a@example.com')).toEqual({ kind: 'unavailable' })
  })

  it('verifyLoginCode() posts the challenge and code with credentials: "include"', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ user: { user_id: 'u1', email_normalized: 'a@example.com' } }))
    const result = await verifyLoginCode(API_BASE, 'opaque-challenge', '012345')
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/auth/verify-code.php`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge: 'opaque-challenge', code: '012345' }),
    })
    expect(result).toEqual({ kind: 'authenticated', user: { userId: 'u1', emailNormalized: 'a@example.com' } })
  })

  it('verifyLoginCode() reports invalid (never a distinguishable reason) for a 400 -- wrong/expired code must never trigger Magic Link fallback', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'invalid or expired code' }, false, 400))
    expect(await verifyLoginCode(API_BASE, 'opaque-challenge', '000000')).toEqual({ kind: 'invalid' })
  })

  it.each([403, 429, 500])('verifyLoginCode() reports unavailable for HTTP %s', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, false, status))
    expect(await verifyLoginCode(API_BASE, 'opaque-challenge', '000000')).toEqual({ kind: 'unavailable' })
  })

  it('verifyLoginCode() reports unavailable on a network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    await expect(verifyLoginCode(API_BASE, 'opaque-challenge', '000000')).resolves.toEqual({ kind: 'unavailable' })
  })

  it('signOutOtherBrowsers() posts with credentials: "include" and reports the revoked count', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ status: 'ok', revoked: 2 }))
    expect(await signOutOtherBrowsers(API_BASE)).toEqual({ kind: 'ok', revoked: 2 })
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/auth/sign-out-others.php`, { method: 'POST', credentials: 'include' })
  })

  it('signOutOtherBrowsers() distinguishes signed-out (401) from no-persistent-session (400)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, false, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'no persistent session on this browser' }, false, 400))
    expect(await signOutOtherBrowsers(API_BASE)).toEqual({ kind: 'signed-out' })
    expect(await signOutOtherBrowsers(API_BASE)).toEqual({ kind: 'no-persistent-session' })
  })

  it('signOutOtherBrowsers() reports unavailable for a server error or network failure', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockRejectedValueOnce(new Error('network down'))
    expect(await signOutOtherBrowsers(API_BASE)).toEqual({ kind: 'unavailable' })
    expect(await signOutOtherBrowsers(API_BASE)).toEqual({ kind: 'unavailable' })
  })
})
