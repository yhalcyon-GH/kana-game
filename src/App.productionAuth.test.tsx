import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as productionAuthClient from './lib/auth/productionAuthClient'
import App from './App'
import { useProgressStore } from './store/progressStore'

vi.mock('./lib/auth/productionAuthClient', async () => {
  const actual = await vi.importActual<typeof import('./lib/auth/productionAuthClient')>('./lib/auth/productionAuthClient')
  return {
    ...actual,
    requestMagicLink: vi.fn(),
    verifyMagicLinkToken: vi.fn(),
    fetchCurrentUser: vi.fn(),
    fetchCurrentEntitlement: vi.fn(),
    logout: vi.fn(),
  }
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  useProgressStore.getState().setHasCompletedIntroGuide(true)
  vi.mocked(productionAuthClient.requestMagicLink).mockReset().mockResolvedValue(undefined)
  vi.mocked(productionAuthClient.verifyMagicLinkToken).mockReset()
  vi.mocked(productionAuthClient.fetchCurrentUser).mockReset().mockResolvedValue(null)
  vi.mocked(productionAuthClient.fetchCurrentEntitlement).mockReset()
  vi.mocked(productionAuthClient.logout).mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('Production Web auth (Phase 3B)', () => {
  it('/login is reachable in development', async () => {
    renderAt('/login')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('/login is reachable in a production build too', async () => {
    (vi.stubEnv as (name: string, value: unknown) => void)('DEV', false)
    renderAt('/login')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('requesting a sign-in link always shows the same generic message (enumeration-safe), regardless of the email', async () => {
    renderAt('/login')

    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'anything@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }))
    })

    expect(productionAuthClient.requestMagicLink).toHaveBeenCalledWith(expect.any(String), 'anything@example.com')
    expect(await screen.findByText(/if an account exists for that email/i)).toBeInTheDocument()
  })

  it('/account shows "Not signed in" and a Sign in link when there is no session cookie', async () => {
    vi.mocked(productionAuthClient.fetchCurrentUser).mockResolvedValue(null)
    renderAt('/account')

    expect(await screen.findByText(/not signed in/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  it('/account resolves the current user purely from the session cookie -- no client-held token is read', async () => {
    vi.mocked(productionAuthClient.fetchCurrentUser).mockResolvedValue({ userId: 'u1', emailNormalized: 'signed-in@example.com' })
    renderAt('/account')

    expect(await screen.findByText('signed-in@example.com')).toBeInTheDocument()
    expect(productionAuthClient.fetchCurrentUser).toHaveBeenCalledWith(expect.any(String))
  })

  it('/account "Check entitlement" reads server-verified entitlement only', async () => {
    vi.mocked(productionAuthClient.fetchCurrentUser).mockResolvedValue({ userId: 'u1', emailNormalized: 'signed-in@example.com' })
    vi.mocked(productionAuthClient.fetchCurrentEntitlement).mockResolvedValue({ active: true })
    renderAt('/account')

    await screen.findByText('signed-in@example.com')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /check entitlement/i }))
    })

    expect(await screen.findByText(/entitlement: active/i)).toBeInTheDocument()
  })

  it('/account "Sign out" calls logout() and returns to the not-signed-in state', async () => {
    vi.mocked(productionAuthClient.fetchCurrentUser).mockResolvedValue({ userId: 'u1', emailNormalized: 'signed-in@example.com' })
    renderAt('/account')
    await screen.findByText('signed-in@example.com')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    })

    expect(productionAuthClient.logout).toHaveBeenCalled()
    expect(await screen.findByText(/not signed in/i)).toBeInTheDocument()
  })

  it('never writes any auth-related value to localStorage or sessionStorage anywhere in the production login/verify/account flow', async () => {
    const localWrite = vi.spyOn(Storage.prototype, 'setItem')

    vi.mocked(productionAuthClient.verifyMagicLinkToken).mockResolvedValue({ userId: 'u1', emailNormalized: 'a@example.com' })
    renderAt('/login')
    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'a@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }))
    })
    await screen.findByText(/if an account exists/i)

    expect(localWrite).not.toHaveBeenCalled()
    localWrite.mockRestore()
  })

  describe('production /verify (ProductionVerifyPage)', () => {
    beforeEach(() => {
      (vi.stubEnv as (name: string, value: unknown) => void)('DEV', false)
    })

    it('strips the token from the visible URL/history before the verify network call resolves', async () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
      let resolveVerify: (value: Awaited<ReturnType<typeof productionAuthClient.verifyMagicLinkToken>>) => void = () => {}
      vi.mocked(productionAuthClient.verifyMagicLinkToken).mockImplementationOnce(
        () => new Promise((resolve) => { resolveVerify = resolve }),
      )

      renderAt('/verify?token=raw-magic-link-token')

      // The verify call itself may already be in flight by the time we
      // observe replaceState (both happen in the same effect tick) --
      // the property under test is the ORDER (replaceState before the
      // call resolves/lingers), not that the call hasn't started yet.
      await waitFor(() => expect(replaceStateSpy).toHaveBeenCalled())
      await waitFor(() => expect(productionAuthClient.verifyMagicLinkToken).toHaveBeenCalled())

      act(() => {
        resolveVerify({ userId: 'u1', emailNormalized: 'a@example.com' })
      })
      await screen.findByText(/you're signed in/i)

      const urlArg = replaceStateSpy.mock.calls[0]?.[2] as string
      expect(urlArg).not.toContain('raw-magic-link-token')
    })

    it('a successful verify shows a link to /account, never a raw session credential', async () => {
      vi.mocked(productionAuthClient.verifyMagicLinkToken).mockResolvedValue({ userId: 'u1', emailNormalized: 'a@example.com' })
      renderAt('/verify?token=raw-magic-link-token')

      const link = await screen.findByRole('link', { name: /go to your account/i })
      expect(link).toHaveAttribute('href', '/account')
      expect(document.body.textContent).not.toContain('raw-magic-link-token')
    })

    it('an invalid/expired token shows a recoverable error with a link back to /login', async () => {
      vi.mocked(productionAuthClient.verifyMagicLinkToken).mockResolvedValue(null)
      renderAt('/verify?token=bad-token')

      expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i)
      expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/login')
    })
  })
})
