import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InitializePaddleOptions, PaddleEventData, PaddleSetupOptions } from '@paddle/paddle-js'
import { EntitlementProvider } from '../components/EntitlementProvider'
import { useEntitlement } from '../components/EntitlementContext'
import AccountPage from './AccountPage'

const sdk = vi.hoisted(() => ({ initialize: vi.fn(), open: vi.fn(), close: vi.fn(), update: vi.fn() }))
vi.mock('@paddle/paddle-js', () => ({ initializePaddle: sdk.initialize }))
const callbacks: Array<(event: PaddleEventData) => void> = []
const fetchMock = vi.fn<typeof fetch>()
const privateRef = 'private-ref-never-render-or-persist'
let entitlement: unknown
let userStatus: number
function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function requestCount(suffix: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input).endsWith(suffix)).length
}
function Observer() {
  const { state } = useEntitlement()
  return <output aria-label="Server access">{state.status}</output>
}
function Tree({ showAccount = true }: { showAccount?: boolean }) {
  return <MemoryRouter><EntitlementProvider><Observer />{showAccount && <AccountPage />}</EntitlementProvider></MemoryRouter>
}
async function renderAccount() {
  const view = render(<Tree />)
  await act(async () => {})
  return view
}
async function start() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sandbox test purchase' })) })
}
function emit(name: string, ref = privateRef, transaction = 'txn_1') {
  callbacks.at(-1)?.({ name, data: { id: 'che_1', transaction_id: transaction, custom_data: { purchase_ref: ref } } } as PaddleEventData)
}
async function complete() {
  await act(async () => { emit('checkout.loaded'); emit('checkout.completed') })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'https://api.example.com')
  vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'sandbox')
  vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_fixture')
  vi.stubEnv('VITE_PADDLE_PRICE_ID', 'pri_fixture')
  callbacks.length = 0
  sdk.open.mockReset()
  sdk.close.mockReset()
  sdk.update.mockReset().mockImplementation((options: Partial<PaddleSetupOptions>) => {
    if (options.eventCallback) callbacks.push(options.eventCallback)
  })
  sdk.initialize.mockReset().mockImplementation(async (options: InitializePaddleOptions) => {
    if (options.eventCallback) callbacks.push(options.eventCallback)
    return { Initialized: true, Checkout: { open: sdk.open, close: sdk.close }, Update: sdk.update }
  })
  entitlement = { active: false }
  userStatus = 200
  fetchMock.mockReset().mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/me.php')) return json({ user_id: 'u1', email_normalized: 'learner@example.com' }, userStatus)
    if (url.endsWith('/entitlement-me.php')) return json(entitlement)
    if (url.endsWith('/purchase-intent.php')) return json({ purchase_ref: privateRef })
    if (url.endsWith('/auth/logout.php')) return json({ ok: true })
    throw new Error('Unexpected request')
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('production Account purchase UI', () => {
  it('preserves loading and signed-out sign-in behavior without purchase controls', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    render(<Tree />)
    expect(screen.getByText('Checking your session…')).toBeInTheDocument()
    await act(async () => { pending.resolve(json({}, 401)) })
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: /purchase/i })).not.toBeInTheDocument()
    expect(requestCount('/purchase-intent.php')).toBe(0)
  })

  it('offers Full Tamamizu with Sandbox labeling and Paddle price/tax/total copy', async () => {
    await renderAccount()
    expect(screen.getByText('Full Tamamizu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sandbox test purchase' })).toBeEnabled()
    expect(screen.getByText('Paddle Checkout shows the price, taxes, and total.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\$|€|£|\b\d+[.,]\d{2}\b/)
  })

  it.each([
    ['VITE_PADDLE_ENVIRONMENT', ''], ['VITE_PADDLE_ENVIRONMENT', 'live'],
    ['VITE_PADDLE_ENVIRONMENT', 'production'], ['VITE_PADDLE_CLIENT_TOKEN', 'live_bad'],
    ['VITE_PADDLE_PRICE_ID', 'invalid'], ['VITE_PADDLE_CLIENT_TOKEN', ''], ['VITE_PADDLE_PRICE_ID', ''],
  ])('disables checkout and explains unavailable config for %s=%s', async (key, value) => {
    vi.stubEnv(key, value)
    await renderAccount()
    expect(screen.getByText('Sandbox configuration unavailable')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Sandbox test purchase' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(requestCount('/purchase-intent.php')).toBe(0)
    expect(sdk.initialize).not.toHaveBeenCalled()
  })

  it('active users have no purchase CTA', async () => {
    entitlement = { active: true }
    await renderAccount()
    expect(screen.getByText('Full Tamamizu: Active')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /purchase/i })).not.toBeInTheDocument()
  })

  it.each([200, 503])('unavailable access has the exact Retry UI (session status %s)', async (status) => {
    userStatus = status
    entitlement = { active: 'true' }
    await renderAccount()
    expect(screen.getByText('Couldn’t verify access')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /purchase/i })).not.toBeInTheDocument()
    userStatus = 200
    entitlement = { active: true }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    expect(screen.getByText('Full Tamamizu: Active')).toBeInTheDocument()
    expect(requestCount('/purchase-intent.php')).toBe(0)
  })

  it('one activation creates one cookie-only intent, disables preparation/open, then verifies once per poll', async () => {
    const pending = deferred<Response>()
    await renderAccount()
    fetchMock.mockReturnValueOnce(pending.promise)
    await start()
    expect(screen.getByRole('button', { name: 'Sandbox test purchase' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Sandbox test purchase' }))
    expect(fetchMock.mock.calls.at(-1)).toEqual(['https://api.example.com/purchase-intent.php', { method: 'POST', credentials: 'include' }])
    await act(async () => { pending.resolve(json({ purchase_ref: privateRef })) })
    expect(screen.getByRole('button', { name: 'Sandbox test purchase' })).toBeDisabled()
    expect(sdk.open).toHaveBeenCalledOnce()
    expect(requestCount('/purchase-intent.php')).toBe(1)
    expect(requestCount('/entitlement-me.php')).toBe(1)
    await complete()
    expect(screen.getByText('Processing purchase…')).toBeInTheDocument()
    expect(screen.getByLabelText('Server access')).toHaveTextContent('inactive')
    expect(screen.queryByRole('button', { name: 'Sandbox test purchase' })).not.toBeInTheDocument()
    expect(requestCount('/entitlement-me.php')).toBe(2)
    entitlement = { active: true }
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByText('Full Tamamizu: Active')).toBeInTheDocument()
    expect(requestCount('/auth/me.php')).toBe(3)
    expect(requestCount('/entitlement-me.php')).toBe(3)
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(requestCount('/entitlement-me.php')).toBe(3)
    expect(requestCount('/purchase-intent.php')).toBe(1)
  })

  it('bounded unavailable confirmation offers Retry without another intent or Checkout', async () => {
    await renderAccount()
    await start()
    entitlement = { active: 'not-a-boolean' }
    await complete()
    expect(screen.getByText('Processing purchase…')).toBeInTheDocument()
    expect(screen.getByLabelText('Server access')).toHaveTextContent('inactive')
    expect(screen.getByText('Signed in as')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(screen.getByText('Still confirming your purchase')).toBeInTheDocument()
    expect(screen.getByLabelText('Server access')).toHaveTextContent('inactive')
    expect(screen.getByText('Signed in as')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/payment failed/i)
    expect(screen.queryByRole('button', { name: 'Sandbox test purchase' })).not.toBeInTheDocument()
    expect(requestCount('/entitlement-me.php')).toBe(7)
    entitlement = { active: true }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    expect(screen.getByText('Full Tamamizu: Active')).toBeInTheDocument()
    expect(requestCount('/entitlement-me.php')).toBe(8)
    expect(requestCount('/purchase-intent.php')).toBe(1)
    expect(sdk.open).toHaveBeenCalledOnce()
  })

  it('logout invalidates access and pending confirmation before awaiting its HTTP response', async () => {
    await renderAccount()
    await start()
    const pendingEntitlement = deferred<Response>()
    const pendingLogout = deferred<Response>()
    fetchMock.mockResolvedValueOnce(json({ user_id: 'u1', email_normalized: 'learner@example.com' }))
      .mockReturnValueOnce(pendingEntitlement.promise)
    await complete()
    const oldCallback = callbacks.at(-1)!
    fetchMock.mockReturnValueOnce(pendingLogout.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByText('Not signed in.')).toBeInTheDocument()
    expect(screen.getByLabelText('Server access')).toHaveTextContent('signed-out')
    expect(sdk.close).toHaveBeenCalledOnce()
    expect(requestCount('/auth/logout.php')).toBe(1)
    await act(async () => {
      pendingEntitlement.resolve(json({ active: true }))
      oldCallback({ name: 'checkout.completed', data: { transaction_id: 'txn_1', custom_data: { purchase_ref: privateRef } } } as PaddleEventData)
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.getByLabelText('Server access')).toHaveTextContent('signed-out')
    expect(screen.queryByText('Full Tamamizu: Active')).not.toBeInTheDocument()
    await act(async () => { pendingLogout.resolve(json({ ok: true })) })
  })

  it.each(['unmount', 'cancel'] as const)('%s prevents a pending poll from applying active to the still-mounted Provider', async (action) => {
    const view = await renderAccount()
    await start()
    const pending = deferred<Response>()
    fetchMock.mockResolvedValueOnce(json({ user_id: 'u1', email_normalized: 'learner@example.com' })).mockReturnValueOnce(pending.promise)
    await complete()
    if (action === 'unmount') view.rerender(<Tree showAccount={false} />)
    else fireEvent.click(screen.getByRole('button', { name: 'Cancel confirmation' }))
    await act(async () => { pending.resolve(json({ active: true })); await vi.advanceTimersByTimeAsync(60_000) })
    expect(screen.getByLabelText('Server access')).toHaveTextContent('inactive')
    expect(requestCount('/entitlement-me.php')).toBe(2)
    expect(sdk.close).toHaveBeenCalledOnce()
  })

  it('an observed 401 cancels confirmation and returns to sign-in', async () => {
    await renderAccount()
    await start()
    userStatus = 401
    await complete()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Server access')).toHaveTextContent('signed-out')
    expect(sdk.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps raw purchase_ref out of DOM, URL, storage, IndexedDB, console and outgoing auth requests', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    const push = vi.spyOn(history, 'pushState')
    const replace = vi.spyOn(history, 'replaceState')
    const consoleSpies = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table']
      .map((name) => vi.spyOn(console, name as 'log').mockImplementation(() => {}))
    const indexedDBOpen = vi.fn()
    vi.stubGlobal('indexedDB', { open: indexedDBOpen })
    await renderAccount()
    await start()
    expect(sdk.open).toHaveBeenCalledWith(expect.objectContaining({ customData: { purchase_ref: privateRef } }))
    const assertPrivate = () => {
      const surfaces = [document.documentElement.outerHTML, location.href, history.state,
        push.mock.calls, replace.mock.calls, storageWrite.mock.calls,
        { ...localStorage }, { ...sessionStorage }, ...consoleSpies.map((spy) => spy.mock.calls), fetchMock.mock.calls]
      expect(JSON.stringify(surfaces)).not.toContain(privateRef)
      expect(indexedDBOpen).not.toHaveBeenCalled()
    }
    assertPrivate()
    await complete()
    assertPrivate()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    assertPrivate()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    assertPrivate()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await act(async () => {})
    assertPrivate()
  })
})
