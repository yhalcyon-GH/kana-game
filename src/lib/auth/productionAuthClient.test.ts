import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCurrentEntitlement,
  fetchCurrentUser,
  logout,
  requestMagicLink,
  verifyMagicLinkToken,
} from './productionAuthClient'

const API_BASE = 'https://api.example.com'

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
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
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, false))
    expect(await fetchCurrentUser(API_BASE)).toBeNull()
  })

  it('fetchCurrentEntitlement() sends credentials: "include"', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ active: true }))
    const result = await fetchCurrentEntitlement(API_BASE)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init).toMatchObject({ credentials: 'include' })
    expect(result).toEqual({ active: true })
  })

  it('logout() posts with credentials: "include" and no Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    await logout(API_BASE)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect((init?.headers as Record<string, string> | undefined)?.['Authorization']).toBeUndefined()
  })

  it('logout() never throws on a network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    await expect(logout(API_BASE)).resolves.toBeUndefined()
  })
})
