import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemorySessionTransport } from '../lib/auth/sessionTransport'
import * as authClient from '../lib/auth/authClient'
import AccountTestPage from './AccountTestPage'

vi.mock('../lib/auth/authClient', async () => {
  const actual = await vi.importActual<typeof import('../lib/auth/authClient')>('../lib/auth/authClient')
  return {
    ...actual,
    requestMagicLink: vi.fn(),
    fetchDevHarnessMagicLink: vi.fn(),
    fetchCurrentUser: vi.fn(),
    createPurchaseIntent: vi.fn(),
    fetchCurrentEntitlement: vi.fn(),
    logout: vi.fn(),
  }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account-test']}>
      <AccountTestPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  inMemorySessionTransport.clear()
  vi.stubEnv('VITE_PADDLE_AUTH_API_BASE_URL', 'https://api.example.com')
  vi.mocked(authClient.requestMagicLink).mockReset().mockResolvedValue(undefined)
  vi.mocked(authClient.fetchDevHarnessMagicLink).mockReset().mockResolvedValue(null)
  vi.mocked(authClient.fetchCurrentUser).mockReset().mockResolvedValue(null)
  vi.mocked(authClient.createPurchaseIntent).mockReset().mockResolvedValue(null)
  vi.mocked(authClient.fetchCurrentEntitlement).mockReset().mockResolvedValue(null)
  vi.mocked(authClient.logout).mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('AccountTestPage', () => {
  it('shows a config-missing message when VITE_PADDLE_AUTH_API_BASE_URL is unset', () => {
    vi.unstubAllEnvs()
    renderPage()
    expect(screen.getByText(/VITE_PADDLE_AUTH_API_BASE_URL/)).toBeInTheDocument()
  })

  it('shows a not-signed-in state when there is no session', async () => {
    renderPage()
    expect(await screen.findByText(/not signed in/i)).toBeInTheDocument()
  })

  it('requesting a magic link calls requestMagicLink with the entered email', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'tester@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /request (test )?magic link/i }))
    })

    await waitFor(() => expect(authClient.requestMagicLink).toHaveBeenCalledWith(expect.any(String), 'tester@example.com'))
  })

  it('retrieving the dev-only link surfaces a follow-link control when one is pending', async () => {
    vi.mocked(authClient.fetchDevHarnessMagicLink).mockResolvedValueOnce('https://example.com/kana-game/#/verify?token=raw-token')
    renderPage()

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'tester@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /request (test )?magic link/i }))
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /retrieve (test )?link/i }))
    })

    const link = await screen.findByRole('link', { name: /follow (test )?sign-in link/i })
    expect(link).toHaveAttribute('href', 'https://example.com/kana-game/#/verify?token=raw-token')
  })

  it('shows the authenticated user once a session exists', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValueOnce({ userId: 'u1', emailNormalized: 'signed-in@example.com' })

    renderPage()

    expect(await screen.findByText('signed-in@example.com')).toBeInTheDocument()
  })

  it('creating a purchase intent shows the returned purchase_ref, never internal_user_id anywhere', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({ userId: 'u1', emailNormalized: 'signed-in@example.com' })
    vi.mocked(authClient.createPurchaseIntent).mockResolvedValueOnce('raw-purchase-ref-value')

    renderPage()
    await screen.findByText('signed-in@example.com')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create purchase intent/i }))
    })

    await waitFor(() => expect(screen.getByTestId('purchase-ref-value')).toHaveTextContent('raw-purchase-ref-value'))
    expect(screen.queryByText(/internal_user_id/)).not.toBeInTheDocument()
  })

  it('checking entitlement shows active/inactive from the server, not from any client-side checkout event', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({ userId: 'u1', emailNormalized: 'signed-in@example.com' })
    vi.mocked(authClient.fetchCurrentEntitlement).mockResolvedValueOnce({ active: true })

    renderPage()
    await screen.findByText('signed-in@example.com')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /check entitlement/i }))
    })

    expect(await screen.findByText(/entitlement: active/i)).toBeInTheDocument()
  })

  it('logging out calls logout() and returns to the not-signed-in state', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({ userId: 'u1', emailNormalized: 'signed-in@example.com' })
    vi.mocked(authClient.logout).mockImplementationOnce(async () => {
      inMemorySessionTransport.clear()
    })

    renderPage()
    await screen.findByText('signed-in@example.com')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    })

    await waitFor(() => expect(authClient.logout).toHaveBeenCalled())
    expect(await screen.findByText(/not signed in/i)).toBeInTheDocument()
  })

  it('an authenticated action failing after logout renders a recoverable state, not a crash', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValueOnce({ userId: 'u1', emailNormalized: 'signed-in@example.com' })
    vi.mocked(authClient.logout).mockImplementationOnce(async () => {
      inMemorySessionTransport.clear()
    })
    vi.mocked(authClient.createPurchaseIntent).mockResolvedValue(null)

    renderPage()
    await screen.findByText('signed-in@example.com')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    })
    await screen.findByText(/not signed in/i)

    // No authenticated actions should be visible / crash after logout.
    expect(screen.queryByRole('button', { name: /create purchase intent/i })).not.toBeInTheDocument()
  })
})
