import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemorySessionTransport } from './sessionTransport'
import {
  requestMagicLink,
  verifyMagicLinkToken,
  fetchCurrentUser,
  createPurchaseIntent,
  fetchCurrentEntitlement,
  logout,
  fetchDevHarnessMagicLink,
  requestLoginCode,
  verifyLoginCode,
  fetchDevHarnessLoginCode,
} from './authClient'

const API_BASE = 'https://api.example.com'

beforeEach(() => {
  inMemorySessionTransport.clear()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestMagicLink', () => {
  it('POSTs the email to request-link.php and never throws on a generic 200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))

    await requestMagicLink(API_BASE, 'user@example.com')

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/auth/request-link.php`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' }),
      }),
    )
  })
})

describe('verifyMagicLinkToken', () => {
  it('POSTs the token in the request body (never a query string) and returns the session token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ session_token: 'raw-session-token', user: { user_id: 'u1', email_normalized: 'a@example.com' } }), {
        status: 200,
      }),
    )

    const result = await verifyMagicLinkToken(API_BASE, 'raw-magic-link-token')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(`${API_BASE}/auth/verify.php`)
    expect(url).not.toContain('raw-magic-link-token')
    expect(init?.body).toBe(JSON.stringify({ token: 'raw-magic-link-token' }))
    expect(result).toEqual({ sessionToken: 'raw-session-token', userId: 'u1', emailNormalized: 'a@example.com' })
  })

  it('returns null (recoverable) for an invalid/expired token response, never throws' , async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid or expired token' }), { status: 400 }))

    const result = await verifyMagicLinkToken(API_BASE, 'bogus-token')
    expect(result).toBeNull()
  })

  it('returns null on a network failure, never throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))

    const result = await verifyMagicLinkToken(API_BASE, 'any-token')
    expect(result).toBeNull()
  })
})

describe('fetchCurrentUser', () => {
  it('sends the session token as an Authorization Bearer header, never in the URL', async () => {
    inMemorySessionTransport.setToken('my-session-token')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ user_id: 'u1', email_normalized: 'a@example.com' }), { status: 200 }),
    )

    const result = await fetchCurrentUser(API_BASE)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(`${API_BASE}/auth/me.php`)
    expect(url).not.toContain('my-session-token')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer my-session-token')
    expect(result).toEqual({ userId: 'u1', emailNormalized: 'a@example.com' })
  })

  it('returns null when there is no session token in memory (no request is even made)' , async () => {
    const result = await fetchCurrentUser(API_BASE)
    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('createPurchaseIntent', () => {
  it('sends the session token as a Bearer header and its own asserted environment, returning the raw purchase_ref when the server echoes the same environment', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ purchase_ref: 'raw-ref-value', environment: 'sandbox' }), { status: 200 }))

    const result = await createPurchaseIntent(API_BASE, 'sandbox')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(`${API_BASE}/purchase-intent.php`)
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer session-abc')
    expect(init!.body).toBe(JSON.stringify({ environment: 'sandbox' }))
    expect(result).toBe('raw-ref-value')
  })

  it('returns null on 401 (no session)', async () => {
    inMemorySessionTransport.setToken('expired-session')
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }))

    const result = await createPurchaseIntent(API_BASE, 'sandbox')
    expect(result).toBeNull()
  })

  it('returns null on a 409 environment mismatch', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'environment mismatch' }), { status: 409 }))

    const result = await createPurchaseIntent(API_BASE, 'live')
    expect(result).toBeNull()
  })

  it('returns null when a 200 response echoes a different environment than asserted', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ purchase_ref: 'raw-ref-value', environment: 'live' }), { status: 200 }))

    const result = await createPurchaseIntent(API_BASE, 'sandbox')
    expect(result).toBeNull()
  })
})

describe('fetchCurrentEntitlement', () => {
  it('reads active/inactive from entitlement-me.php using the Bearer session', async () => {
    inMemorySessionTransport.setToken('session-xyz')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ user_id: 'u1', product: 'full_tamamizu', active: true, updated_at: '2026-01-01' }), { status: 200 }),
    )

    const result = await fetchCurrentEntitlement(API_BASE)

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(`${API_BASE}/entitlement-me.php`)
    expect(result).toEqual({ active: true })
  })
})

describe('logout', () => {
  it('POSTs to logout.php with the Bearer session and clears the in-memory session afterward', async () => {
    inMemorySessionTransport.setToken('session-to-clear')
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))

    await logout(API_BASE)

    expect(inMemorySessionTransport.getToken()).toBeNull()
  })
})

describe('fetchDevHarnessMagicLink', () => {
  it('GETs the dev-only endpoint with the email as a query param and returns the magic_link_url', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ magic_link_url: 'https://example.com/kana-game/#/verify?token=raw' }), { status: 200 }),
    )

    const result = await fetchDevHarnessMagicLink(API_BASE, 'user@example.com')

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/dev-only/last-magic-link.php')
    expect(url).toContain('email=user%40example.com')
    expect(result).toBe('https://example.com/kana-game/#/verify?token=raw')
  })

  it('returns null when the harness is disabled (403) or no link is pending (404)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'dev harness disabled' }), { status: 403 }))
    expect(await fetchDevHarnessMagicLink(API_BASE, 'user@example.com')).toBeNull()
  })
})

describe('requestLoginCode', () => {
  it('POSTs the email to request-code.php and returns the issued challenge', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', challenge: 'opaque-challenge' }), { status: 200 }))

    const result = await requestLoginCode(API_BASE, 'a@example.com')

    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/auth/request-code.php`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'a@example.com' }),
    }))
    expect(result).toBe('opaque-challenge')
  })

  it('returns null when no challenge is issued (enumeration-safe response)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
    expect(await requestLoginCode(API_BASE, 'a@example.com')).toBeNull()
  })
})

describe('verifyLoginCode', () => {
  it('POSTs the challenge and code (Bearer mode) and returns the session token/user', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      session_token: 'raw-session', persistent_token: 'raw-persistent',
      user: { user_id: 'u1', email_normalized: 'a@example.com' },
    }), { status: 200 }))

    const result = await verifyLoginCode(API_BASE, 'opaque-challenge', '012345')

    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/auth/verify-code.php`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ challenge: 'opaque-challenge', code: '012345' }),
    }))
    expect(result).toEqual({ sessionToken: 'raw-session', userId: 'u1', emailNormalized: 'a@example.com' })
  })

  it('returns null for an invalid/expired code, never throws', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid or expired code' }), { status: 400 }))
    expect(await verifyLoginCode(API_BASE, 'opaque-challenge', '000000')).toBeNull()
  })
})

describe('fetchDevHarnessLoginCode', () => {
  it('GETs the dev-only endpoint with the email as a query param and returns the login_code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ login_code: '012345' }), { status: 200 }))

    const result = await fetchDevHarnessLoginCode(API_BASE, 'user@example.com')

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/dev-only/last-login-code.php')
    expect(url).toContain('email=user%40example.com')
    expect(result).toBe('012345')
  })

  it('returns null when the harness is disabled (403) or no code is pending (404)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'dev harness disabled' }), { status: 403 }))
    expect(await fetchDevHarnessLoginCode(API_BASE, 'user@example.com')).toBeNull()
  })
})
