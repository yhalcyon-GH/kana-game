import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializePaddle, type Paddle, type PaddleEventData } from '@paddle/paddle-js'
import PaddleTestPage from './PaddleTestPage'

// Mock the external SDK boundary; no real token, price, CDN, or payment.
vi.mock('@paddle/paddle-js', () => ({ initializePaddle: vi.fn() }))
const openCheckout = vi.fn()
const closeCheckout = vi.fn()
const paddle = { Initialized: true, Checkout: { open: openCheckout, close: closeCheckout } } as unknown as Paddle

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'sandbox')
  vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_poc_fixture')
  vi.stubEnv('VITE_PADDLE_PRICE_ID', 'pri_poc_fixture')
  vi.mocked(initializePaddle).mockResolvedValue(paddle)
})

afterEach(() => vi.unstubAllEnvs())

function button() {
  return screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })
}

function emit(name: string) {
  // The display consumes only the documented optional event name, never customer/payment data.
  act(() => vi.mocked(initializePaddle).mock.calls.at(-1)?.[0]?.eventCallback?.({ name } as PaddleEventData))
}

describe('Paddle Sandbox checkout page', () => {
  it.each(['VITE_PADDLE_ENVIRONMENT', 'VITE_PADDLE_CLIENT_TOKEN', 'VITE_PADDLE_PRICE_ID'] as const)(
    'blocks checkout and names the missing %s configuration', (key) => {
      vi.stubEnv(key, '   ')
      render(<PaddleTestPage />)
      expect(screen.getByRole('alert')).toHaveTextContent(key)
      expect(button()).toBeDisabled()
      fireEvent.click(button())
      expect(initializePaddle).not.toHaveBeenCalled()
      expect(openCheckout).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['VITE_PADDLE_ENVIRONMENT', 'production'],
    ['VITE_PADDLE_CLIENT_TOKEN', 'live_invalid_fixture'],
    ['VITE_PADDLE_CLIENT_TOKEN', 'pdl_sdbx_apikey_invalid_fixture'],
    ['VITE_PADDLE_PRICE_ID', 'pro_invalid_fixture'],
  ] as const)('rejects invalid %s configuration', (key, value) => {
    vi.stubEnv(key, value)
    render(<PaddleTestPage />)
    expect(screen.getByRole('alert')).toHaveTextContent(key)
    fireEvent.click(button())
    expect(initializePaddle).not.toHaveBeenCalled()
    expect(openCheckout).not.toHaveBeenCalled()
  })

  it('blocks direct page use outside development even with valid sandbox config', () => {
    vi.stubEnv('DEV', false)
    render(<PaddleTestPage />)
    expect(button()).toBeDisabled()
    fireEvent.click(button())
    expect(initializePaddle).not.toHaveBeenCalled()
  })

  it('initializes sandbox only on click and opens the configured price once with quantity 1', async () => {
    render(<StrictMode><PaddleTestPage /></StrictMode>)
    expect(screen.getByRole('heading', { name: 'Full Tamamizu' })).toBeInTheDocument()
    expect(screen.getByText('$4.99 one-time')).toBeInTheDocument()
    expect(initializePaddle).not.toHaveBeenCalled()
    fireEvent.click(button())
    fireEvent.click(button())
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))
    expect(initializePaddle).toHaveBeenCalledExactlyOnceWith({
      environment: 'sandbox', token: 'test_poc_fixture', eventCallback: expect.any(Function),
    })
    expect(openCheckout).toHaveBeenCalledWith({
      settings: { displayMode: 'overlay' },
      items: [{ priceId: 'pri_poc_fixture', quantity: 1 }],
      customData: { internal_user_id: 'sandbox-test-user' },
    })
  })

  it('always attaches the fixed Sandbox test user id as customData, never a real/production identifier', async () => {
    render(<PaddleTestPage />)
    fireEvent.click(button())
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))
    const call = openCheckout.mock.calls[0][0] as { customData?: Record<string, unknown> }
    expect(call.customData).toEqual({ internal_user_id: 'sandbox-test-user' })
  })

  it('shows events and keeps completion visible after closing, without persisting an unlock', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    render(<PaddleTestPage />)
    fireEvent.click(button())
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))
    emit('checkout.loaded')
    emit('checkout.completed')
    emit('checkout.closed')
    expect(screen.getByRole('log')).toHaveTextContent('checkout.loaded')
    expect(screen.getByRole('log')).toHaveTextContent('checkout.completed')
    expect(screen.getByRole('status')).toHaveTextContent(/purchase successful.*checkout completed/i)
    expect(storageWrite).not.toHaveBeenCalled()
    storageWrite.mockRestore()
    fireEvent.click(button())
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).not.toHaveTextContent(/purchase successful/i)
  })

  it.each(['rejected', 'undefined', 'uninitialized', 'open throws'])(
    'shows a recoverable error when SDK result is %s', async (failure) => {
      if (failure === 'rejected') vi.mocked(initializePaddle).mockRejectedValueOnce(new Error('SDK unavailable'))
      if (failure === 'undefined') vi.mocked(initializePaddle).mockResolvedValueOnce(undefined)
      if (failure === 'uninitialized') vi.mocked(initializePaddle).mockResolvedValueOnce({ ...paddle, Initialized: false })
      if (failure === 'open throws') openCheckout.mockImplementationOnce(() => { throw new Error('Checkout unavailable') })
      render(<PaddleTestPage />)
      fireEvent.click(button())
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not open.*reload/i)
      expect(button()).toBeEnabled()
      if (failure !== 'open throws') expect(openCheckout).not.toHaveBeenCalled()
    },
  )

  it('does not open a checkout after navigating away during SDK loading', async () => {
    let resolve!: (value: Paddle) => void
    vi.mocked(initializePaddle).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const { unmount } = render(<PaddleTestPage />)
    fireEvent.click(button())
    unmount()
    await act(async () => resolve(paddle))
    expect(openCheckout).not.toHaveBeenCalled()
  })

  it('closes its checkout on unmount and can open again after revisiting', async () => {
    const { unmount } = render(<PaddleTestPage />)
    fireEvent.click(button())
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(1))
    unmount()
    expect(closeCheckout).toHaveBeenCalledTimes(1)
    render(<PaddleTestPage />)
    fireEvent.click(button())
    await waitFor(() => expect(openCheckout).toHaveBeenCalledTimes(2))
    emit('checkout.completed')
    expect(screen.getByRole('status')).toHaveTextContent(/purchase successful/i)
  })
})

describe('Paddle Sandbox entitlement check (Phase 2 PoC)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('disables the entitlement check when VITE_PADDLE_ENTITLEMENT_API_URL is not set', () => {
    render(<PaddleTestPage />)
    expect(screen.queryByRole('button', { name: 'Check entitlement' })).not.toBeInTheDocument()
    expect(screen.getByTestId('entitlement-config-missing')).toHaveTextContent('VITE_PADDLE_ENTITLEMENT_API_URL')
  })

  it('is disabled even with a configured URL when outside development', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PADDLE_ENTITLEMENT_API_URL', 'https://example.test/entitlement.php')
    render(<PaddleTestPage />)
    expect(screen.queryByRole('button', { name: 'Check entitlement' })).not.toBeInTheDocument()
  })

  it('fetches the fixed Sandbox test user id and shows active on success', async () => {
    vi.stubEnv('VITE_PADDLE_ENTITLEMENT_API_URL', 'https://example.test/entitlement.php')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user_id: 'sandbox-test-user', product: 'full_tamamizu', active: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PaddleTestPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Check entitlement' }))

    await waitFor(() => expect(screen.getByTestId('entitlement-status')).toHaveTextContent('Entitlement: active'))
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string)
    expect(requestedUrl.searchParams.get('user_id')).toBe('sandbox-test-user')
  })

  it('shows inactive when the endpoint reports active: false', async () => {
    vi.stubEnv('VITE_PADDLE_ENTITLEMENT_API_URL', 'https://example.test/entitlement.php')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user_id: 'sandbox-test-user', product: 'full_tamamizu', active: false }),
    }))

    render(<PaddleTestPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Check entitlement' }))

    await waitFor(() => expect(screen.getByTestId('entitlement-status')).toHaveTextContent('Entitlement: inactive'))
  })

  it('shows a recoverable error when the entitlement endpoint fails', async () => {
    vi.stubEnv('VITE_PADDLE_ENTITLEMENT_API_URL', 'https://example.test/entitlement.php')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }))

    render(<PaddleTestPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Check entitlement' }))

    await waitFor(() => expect(screen.getByTestId('entitlement-status')).toHaveTextContent(/entitlement check error/i))
  })

  it('shows a recoverable error when the entitlement endpoint is unreachable', async () => {
    vi.stubEnv('VITE_PADDLE_ENTITLEMENT_API_URL', 'https://example.test/entitlement.php')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    render(<PaddleTestPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Check entitlement' }))

    await waitFor(() => expect(screen.getByTestId('entitlement-status')).toHaveTextContent(/could not reach/i))
  })
})
