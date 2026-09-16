import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntitlementContext, type EntitlementContextValue, type EntitlementState } from '../components/EntitlementContext'
import AccountPage from './AccountPage'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  usePurchase: vi.fn(),
}))

vi.mock('../lib/auth/productionAuthClient', () => ({ logout: mocks.logout }))
vi.mock('../lib/auth/productionAuthApiBase', () => ({ readProductionAuthApiBase: () => 'https://api.example.com' }))
vi.mock('../hooks/useProductionSandboxPurchase', () => ({ useProductionSandboxPurchase: mocks.usePurchase }))

const user = { userId: 'u1', emailNormalized: 'signed-in@example.com' }
const signedIn: EntitlementState = { status: 'inactive', user }

function Harness() {
  const [state, setState] = useState<EntitlementState>(signedIn)
  const value: EntitlementContextValue = {
    state,
    refresh: async () => ({ kind: 'applied', state }),
    markSignedOut: () => setState({ status: 'signed-out', user: null }),
  }
  return (
    <MemoryRouter>
      <EntitlementContext.Provider value={value}>
        <AccountPage />
      </EntitlementContext.Provider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mocks.logout.mockReset()
  mocks.usePurchase.mockReset().mockReturnValue({
    status: 'idle',
    configured: false,
    environment: null,
    start: vi.fn(async () => {}),
    retry: vi.fn(),
    cancel: vi.fn(),
    invalidate: vi.fn(),
  })
})

describe('AccountPage Production sign out', () => {
  it('keeps the authenticated state and offers retry when server revoke is unconfirmed', async () => {
    mocks.logout.mockResolvedValueOnce({ kind: 'unavailable' })
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t sign out.*try again/i)
    expect(screen.getByText('signed-in@example.com')).toBeInTheDocument()
    expect(screen.queryByText(/not signed in/i)).not.toBeInTheDocument()
    expect(mocks.usePurchase.mock.results[0]?.value.invalidate).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
  })

  it('does not send duplicate logout requests while one is in flight, then signs out only after success', async () => {
    let resolveLogout!: (value: { kind: 'signed-out' }) => void
    mocks.logout.mockReturnValueOnce(new Promise((resolve) => { resolveLogout = resolve }))
    render(<Harness />)

    const signOut = screen.getByRole('button', { name: 'Sign out' })
    fireEvent.click(signOut)

    expect(await screen.findByRole('button', { name: 'Signing out…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Signing out…' }))
    expect(mocks.logout).toHaveBeenCalledOnce()

    resolveLogout({ kind: 'signed-out' })
    expect(await screen.findByText(/not signed in/i)).toBeInTheDocument()
  })

  it('can retry a failed sign out and transitions only when the retry is confirmed', async () => {
    mocks.logout
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'signed-out' })
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/not signed in/i)).toBeInTheDocument()
  })
})
