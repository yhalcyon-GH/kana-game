import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logout } from './productionAuthClient'

const API_BASE = 'https://api.example.com'

function response(ok: boolean, status: number): Response {
  return { ok, status } as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Production Web logout result', () => {
  it('reports signed-out only after a successful cookie-authenticated server response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(true, 200))

    expect(await logout(API_BASE)).toEqual({ kind: 'signed-out' })
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${API_BASE}/auth/logout.php`, {
      method: 'POST',
      credentials: 'include',
    })
  })

  it.each([401, 403, 500])('keeps logout unconfirmed for HTTP %s', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(response(false, status))

    expect(await logout(API_BASE)).toEqual({ kind: 'unavailable' })
  })

  it('keeps logout unconfirmed on a network failure without leaking the error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('private network detail'))

    await expect(logout(API_BASE)).resolves.toEqual({ kind: 'unavailable' })
  })
})
