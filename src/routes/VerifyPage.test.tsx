import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemorySessionTransport } from '../lib/auth/sessionTransport'
import * as authClient from '../lib/auth/authClient'
import VerifyPage from './VerifyPage'

vi.mock('../lib/auth/authClient', async () => {
  const actual = await vi.importActual<typeof import('../lib/auth/authClient')>('../lib/auth/authClient')
  return { ...actual, verifyMagicLinkToken: vi.fn() }
})

function renderAtHash(hash: string) {
  return render(
    <MemoryRouter initialEntries={[`/verify${hash}`]}>
      <VerifyPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  inMemorySessionTransport.clear()
  vi.stubEnv('VITE_PADDLE_AUTH_API_BASE_URL', 'https://api.example.com')
  vi.mocked(authClient.verifyMagicLinkToken).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('VerifyPage', () => {
  it('reads the token from the query string and calls verifyMagicLinkToken with it', async () => {
    vi.mocked(authClient.verifyMagicLinkToken).mockResolvedValueOnce({
      sessionToken: 'raw-session-token',
      userId: 'u1',
      emailNormalized: 'a@example.com',
    })

    renderAtHash('?token=raw-magic-link-token')

    await waitFor(() => expect(authClient.verifyMagicLinkToken).toHaveBeenCalledWith(expect.any(String), 'raw-magic-link-token'))
  })

  it('strips the token from the visible URL/history before the verify network call resolves', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    let resolveVerify: (value: Awaited<ReturnType<typeof authClient.verifyMagicLinkToken>>) => void = () => {}
    vi.mocked(authClient.verifyMagicLinkToken).mockImplementationOnce(
      () => new Promise((resolve) => { resolveVerify = resolve }),
    )

    renderAtHash('?token=raw-magic-link-token')

    // The history strip must happen synchronously, before the async
    // verify call is even given a chance to resolve.
    await waitFor(() => expect(replaceStateSpy).toHaveBeenCalled())
    expect(authClient.verifyMagicLinkToken).toHaveBeenCalled()

    resolveVerify({ sessionToken: 'tok', userId: 'u1', emailNormalized: 'a@example.com' })
  })

  it('stores the returned session token only in inMemorySessionTransport' , async () => {
    vi.mocked(authClient.verifyMagicLinkToken).mockResolvedValueOnce({
      sessionToken: 'the-session-token',
      userId: 'u1',
      emailNormalized: 'a@example.com',
    })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    renderAtHash('?token=raw-magic-link-token')

    await waitFor(() => expect(inMemorySessionTransport.getToken()).toBe('the-session-token'))
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('never writes to localStorage or sessionStorage at any point' , async () => {
    vi.mocked(authClient.verifyMagicLinkToken).mockResolvedValueOnce({
      sessionToken: 'tok',
      userId: 'u1',
      emailNormalized: 'a@example.com',
    })
    const localSpy = vi.spyOn(Storage.prototype, 'setItem')

    renderAtHash('?token=raw-magic-link-token')
    await waitFor(() => expect(inMemorySessionTransport.getToken()).toBe('tok'))

    expect(localSpy).not.toHaveBeenCalled()
  })

  it('renders a recoverable error state for an invalid/expired token, without throwing' , async () => {
    vi.mocked(authClient.verifyMagicLinkToken).mockResolvedValueOnce(null)

    renderAtHash('?token=bogus-token')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(inMemorySessionTransport.getToken()).toBeNull()
  })

  it('renders a recoverable state (not a crash) when no token is present in the URL at all' , async () => {
    renderAtHash('')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(authClient.verifyMagicLinkToken).not.toHaveBeenCalled()
  })
})
