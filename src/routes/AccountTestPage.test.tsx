import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializePaddle, type Paddle, type PaddleEventData } from '@paddle/paddle-js'
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

// Mock the external SDK boundary; no real token, price, CDN, or payment.
vi.mock('@paddle/paddle-js', () => ({ initializePaddle: vi.fn() }))
const openCheckout = vi.fn()
const closeCheckout = vi.fn()
const paddle = { Initialized: true, Checkout: { open: openCheckout, close: closeCheckout } } as unknown as Paddle

async function signInWithPurchaseRef(purchaseRef = 'raw-purchase-ref-value') {
  inMemorySessionTransport.setToken('session-abc')
  vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({ userId: 'u1', emailNormalized: 'signed-in@example.com' })
  vi.mocked(authClient.createPurchaseIntent).mockResolvedValueOnce(purchaseRef)

  renderPage()
  await screen.findByText('signed-in@example.com')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /create purchase intent/i }))
  })
  await waitFor(() => expect(screen.getByTestId('purchase-ref-value')).toHaveTextContent(purchaseRef))
}

// Minimal fixture matching Paddle's real checkout.loaded/completed event
// shape (CheckoutEventsData): `data.id`, `data.transaction_id`,
// `data.custom_data` -- see node_modules/@paddle/paddle-js/types/checkout/events.d.ts.
function paddleEventFixture(
  name: 'checkout.loaded' | 'checkout.completed' | 'checkout.closed',
  overrides: { transactionId?: string; purchaseRef?: string } = {},
): PaddleEventData {
  return {
    name: name as PaddleEventData['name'],
    data: {
      id: 'che_fixture',
      transaction_id: overrides.transactionId ?? 'txn_fixture',
      custom_data: overrides.purchaseRef === undefined ? null : { purchase_ref: overrides.purchaseRef },
    } as PaddleEventData['data'],
  }
}

function latestEventCallback() {
  return vi.mocked(initializePaddle).mock.calls.at(-1)?.[0]?.eventCallback
}

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
  vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'sandbox')
  vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_poc_fixture')
  vi.stubEnv('VITE_PADDLE_PRICE_ID', 'pri_poc_fixture')
  vi.mocked(authClient.requestMagicLink).mockReset().mockResolvedValue(undefined)
  vi.mocked(authClient.fetchDevHarnessMagicLink).mockReset().mockResolvedValue(null)
  vi.mocked(authClient.fetchCurrentUser).mockReset().mockResolvedValue(null)
  vi.mocked(authClient.createPurchaseIntent).mockReset().mockResolvedValue(null)
  vi.mocked(authClient.fetchCurrentEntitlement).mockReset().mockResolvedValue(null)
  vi.mocked(authClient.logout).mockReset().mockResolvedValue(undefined)
  vi.clearAllMocks()
  vi.mocked(initializePaddle).mockResolvedValue(paddle)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('AccountTestPage', () => {
  it('shows a config-missing message when VITE_PADDLE_AUTH_API_BASE_URL is unset', () => {
    // Explicitly blank rather than vi.unstubAllEnvs() -- a developer's own
    // .env.local (e.g. for a real deployed backend) would otherwise leak
    // through as the stubEnv baseline once stubs are cleared.
    vi.stubEnv('VITE_PADDLE_AUTH_API_BASE_URL', '')
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

  it('does not show or enable Retrieve until the request-link call has actually completed (no race)', async () => {
    let resolveRequest!: () => void
    vi.mocked(authClient.requestMagicLink).mockReturnValueOnce(
      new Promise((resolve) => { resolveRequest = () => resolve(undefined) }),
    )

    renderPage()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'tester@example.com' } })

    const requestButton = screen.getByRole('button', { name: /request (test )?magic link/i })
    fireEvent.click(requestButton)

    // While the request is still in flight: Request is disabled, and
    // Retrieve is not offered at all yet -- there must be no window
    // where a click on Retrieve could race dev_harness_magic_links not
    // having a row yet.
    expect(requestButton).toBeDisabled()
    expect(screen.queryByRole('button', { name: /retrieve (test )?link/i })).not.toBeInTheDocument()
    expect(authClient.fetchDevHarnessMagicLink).not.toHaveBeenCalled()

    await act(async () => {
      resolveRequest()
    })

    // Only after the awaited request-link call resolves does Retrieve appear.
    expect(await screen.findByRole('button', { name: /retrieve (test )?link/i })).toBeEnabled()
    expect(requestButton).toBeEnabled()
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
    // The purchase-intent section's own text never names internal_user_id
    // as a value in play here -- the Sandbox Checkout section below it
    // legitimately mentions the name in prose ("never internal_user_id")
    // to document what customData excludes, which is a distinct claim.
    expect(screen.getByTestId('purchase-ref-value').closest('section')).not.toHaveTextContent('internal_user_id')
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

  it('does not offer Phase 3 Sandbox Checkout before a purchase intent exists', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({ userId: 'u1', emailNormalized: 'signed-in@example.com' })

    renderPage()
    await screen.findByText('signed-in@example.com')

    expect(screen.queryByRole('button', { name: 'Open Paddle Sandbox Checkout' })).not.toBeInTheDocument()
  })

  it('offers Phase 3 Sandbox Checkout once purchase_ref is obtained, and opens it with customData: { purchase_ref } only', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')

    const button = screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)

    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))
    expect(initializePaddle).toHaveBeenCalledExactlyOnceWith({
      environment: 'sandbox', token: 'test_poc_fixture', eventCallback: expect.any(Function),
    })
    expect(openCheckout).toHaveBeenCalledWith({
      settings: { displayMode: 'overlay' },
      items: [{ priceId: 'pri_poc_fixture', quantity: 1 }],
      customData: { purchase_ref: 'raw-purchase-ref-value' },
    })
    const call = openCheckout.mock.calls[0][0] as { customData?: Record<string, unknown> }
    expect(call.customData).not.toHaveProperty('internal_user_id')
    expect(Object.keys(call.customData ?? {})).toEqual(['purchase_ref'])
  })

  it('never places the raw purchase_ref in the URL or browser storage', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    await signInWithPurchaseRef('raw-purchase-ref-value')

    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    expect(window.location.href).not.toContain('raw-purchase-ref-value')
    expect(storageWrite).not.toHaveBeenCalled()
    storageWrite.mockRestore()
  })

  it('shows Sandbox config errors and keeps checkout disabled when Paddle Sandbox env vars are missing', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', '   ')
    await signInWithPurchaseRef()

    expect(screen.getByTestId('sandbox-checkout-config-missing')).toHaveTextContent('VITE_PADDLE_CLIENT_TOKEN')
    const button = screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(initializePaddle).not.toHaveBeenCalled()
  })

  it('does not grant/imply entitlement from a correlated checkout.completed -- only shows a diagnostic status', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')

    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.loaded', { transactionId: 'txn_1', purchaseRef: 'raw-purchase-ref-value' }))
    })
    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.completed', { transactionId: 'txn_1', purchaseRef: 'raw-purchase-ref-value' }))
    })

    expect(screen.getByText(/checkout completed.*entitlement is not granted client-side/i)).toBeInTheDocument()
    // Entitlement is still whatever the last server check reported -- unaffected by the client event.
    expect(vi.mocked(authClient.fetchCurrentEntitlement)).not.toHaveBeenCalled()
  })

  it('initializePaddle is called at most once per mount, even across multiple purchase intents and Opens', async () => {
    await signInWithPurchaseRef('ref-1')
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.closed'))
    })

    vi.mocked(authClient.createPurchaseIntent).mockResolvedValueOnce('ref-2')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create purchase intent/i }))
    })
    await waitFor(() => expect(screen.getByTestId('purchase-ref-value')).toHaveTextContent('ref-2'))

    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(2))

    expect(initializePaddle).toHaveBeenCalledTimes(1)
  })

  it('clicking Open twice in a row only calls Checkout.open once', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    const button = screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })

    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))
    expect(initializePaddle).toHaveBeenCalledTimes(1)
  })

  it('checkout.loaded with a matching purchase_ref correlates and tracks the transaction', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.loaded', { transactionId: 'txn_1', purchaseRef: 'raw-purchase-ref-value' }))
    })

    expect(screen.getByText(/checkout loaded and correlated/i)).toBeInTheDocument()
    expect(closeCheckout).not.toHaveBeenCalled()
  })

  it('checkout.loaded with a mismatched purchase_ref closes the checkout and shows a mismatch error, never completed', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.loaded', { transactionId: 'txn_stale', purchaseRef: 'a-different-purchase-ref' }))
    })

    expect(closeCheckout).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/could not be correlated to the current purchase intent/i)).toBeInTheDocument()
    expect(screen.getByText(/purchase_ref match: false/i)).toBeInTheDocument()
    expect(screen.queryByText(/checkout completed/i)).not.toBeInTheDocument()
    // No raw ids/refs leaked into the mismatch message.
    expect(screen.queryByText(/txn_stale/)).not.toBeInTheDocument()
    expect(screen.queryByText(/a-different-purchase-ref/)).not.toBeInTheDocument()
  })

  it('checkout.completed with a mismatched transaction_id is not treated as completed', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.loaded', { transactionId: 'txn_tracked', purchaseRef: 'raw-purchase-ref-value' }))
    })
    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.completed', { transactionId: 'txn_other', purchaseRef: 'raw-purchase-ref-value' }))
    })

    expect(screen.getByText(/completion could not be correlated/i)).toBeInTheDocument()
    expect(screen.getByText(/transaction match: false/i)).toBeInTheDocument()
    expect(screen.queryByText(/checkout completed \(sandbox\)/i)).not.toBeInTheDocument()
  })

  it('checkout.completed with a mismatched purchase_ref is not treated as completed', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.loaded', { transactionId: 'txn_tracked', purchaseRef: 'raw-purchase-ref-value' }))
    })
    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.completed', { transactionId: 'txn_tracked', purchaseRef: 'someone-elses-ref' }))
    })

    expect(screen.getByText(/completion could not be correlated/i)).toBeInTheDocument()
    expect(screen.getByText(/purchase_ref match: false/i)).toBeInTheDocument()
    expect(screen.queryByText(/checkout completed \(sandbox\)/i)).not.toBeInTheDocument()
  })

  it('disables Create purchase intent while a checkout attempt is active', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    expect(screen.getByRole('button', { name: /create purchase intent/i })).toBeDisabled()
  })

  it('disables Open Paddle Sandbox Checkout while a checkout attempt is already active', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    const button = screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })
    fireEvent.click(button)
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    expect(button).toBeDisabled()
  })

  it('checkout.closed safely resets state, re-enabling both buttons for a retry', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: /create purchase intent/i })).toBeDisabled()

    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.closed'))
    })

    expect(screen.getByRole('button', { name: /create purchase intent/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })).toBeEnabled()
  })

  it('keeps Open disabled for the same purchase_ref after a correlated completion, until a new intent is created', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.loaded', { transactionId: 'txn_1', purchaseRef: 'raw-purchase-ref-value' }))
    })
    act(() => {
      latestEventCallback()?.(paddleEventFixture('checkout.completed', { transactionId: 'txn_1', purchaseRef: 'raw-purchase-ref-value' }))
    })

    expect(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })).toBeDisabled()

    vi.mocked(authClient.createPurchaseIntent).mockResolvedValueOnce('ref-2')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create purchase intent/i }))
    })
    await waitFor(() => expect(screen.getByTestId('purchase-ref-value')).toHaveTextContent('ref-2'))

    expect(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })).toBeEnabled()
  })

  it('unmounting while a checkout is active closes it', async () => {
    inMemorySessionTransport.setToken('session-abc')
    vi.mocked(authClient.fetchCurrentUser).mockResolvedValue({ userId: 'u1', emailNormalized: 'signed-in@example.com' })
    vi.mocked(authClient.createPurchaseIntent).mockResolvedValueOnce('raw-purchase-ref-value')

    const { unmount } = renderPage()
    await screen.findByText('signed-in@example.com')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create purchase intent/i }))
    })
    await waitFor(() => expect(screen.getByTestId('purchase-ref-value')).toHaveTextContent('raw-purchase-ref-value'))

    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    unmount()

    expect(closeCheckout).toHaveBeenCalled()
  })

  it('logging out while a checkout is active closes it and clears the busy guard', async () => {
    await signInWithPurchaseRef('raw-purchase-ref-value')
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    vi.mocked(authClient.logout).mockImplementationOnce(async () => {
      inMemorySessionTransport.clear()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    })

    expect(closeCheckout).toHaveBeenCalled()
    await screen.findByText(/not signed in/i)
  })

  it('resets checkout state on logout so a new session starts clean', async () => {
    await signInWithPurchaseRef()
    fireEvent.click(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' }))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))

    vi.mocked(authClient.logout).mockImplementationOnce(async () => {
      inMemorySessionTransport.clear()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    })

    await screen.findByText(/not signed in/i)
    expect(screen.queryByRole('button', { name: 'Open Paddle Sandbox Checkout' })).not.toBeInTheDocument()
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
