import { StrictMode, type ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InitializePaddleOptions, PaddleEventData, PaddleSetupOptions } from '@paddle/paddle-js'
import { EntitlementContext, type EntitlementContextValue, type EntitlementRefreshResult, type EntitlementState } from '../components/EntitlementContext'
import { createPurchaseIntent } from '../lib/auth/productionAuthClient'
import { useProductionSandboxPurchase } from './useProductionSandboxPurchase'

const sdk = vi.hoisted(() => ({ initialize: vi.fn(), open: vi.fn(), close: vi.fn(), update: vi.fn() }))
vi.mock('@paddle/paddle-js', () => ({ initializePaddle: sdk.initialize }))
vi.mock('../lib/auth/productionAuthClient', async (original) => ({
  ...await original<typeof import('../lib/auth/productionAuthClient')>(), createPurchaseIntent: vi.fn(),
}))

const user = { userId: 'u1', emailNormalized: 'learner@example.com' }
const inactive: EntitlementState = { status: 'inactive', user }
const active: EntitlementState = { status: 'active', user }
const callbacks: Array<(event: PaddleEventData) => void> = []
function event(name: string, ref = 'private-purchase-ref', transaction = 'txn_1'): PaddleEventData {
  return { name, data: { id: 'che_1', transaction_id: transaction, custom_data: { purchase_ref: ref } } } as PaddleEventData
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function fixture(initialState = inactive, strict = false) {
  const refresh = vi.fn<EntitlementContextValue['refresh']>().mockResolvedValue({ kind: 'applied', state: inactive })
  const markSignedOut = vi.fn()
  let state = initialState
  const wrapper = ({ children }: { children: ReactNode }) => {
    const tree = <EntitlementContext.Provider value={{ state, refresh, markSignedOut }}>{children}</EntitlementContext.Provider>
    return strict ? <StrictMode>{tree}</StrictMode> : tree
  }
  const hook = renderHook(() => useProductionSandboxPurchase(), { wrapper })
  return {
    ...hook, refresh, markSignedOut,
    setState: (next: EntitlementState) => { state = next; hook.rerender() },
    start: () => act(async () => { await hook.result.current.start() }),
    complete: () => act(async () => {
      callbacks.at(-1)?.(event('checkout.loaded'))
      callbacks.at(-1)?.(event('checkout.completed'))
    }),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
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
  vi.mocked(createPurchaseIntent).mockReset().mockResolvedValue({ kind: 'created', purchaseRef: 'private-purchase-ref' })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('production Sandbox purchase orchestration', () => {
  it('creates one intent and opens once despite synchronous duplicate activation', async () => {
    const f = fixture()
    const pending = deferred<Awaited<ReturnType<typeof createPurchaseIntent>>>()
    vi.mocked(createPurchaseIntent).mockReturnValueOnce(pending.promise)
    let start!: Promise<void>
    act(() => { start = f.result.current.start(); void f.result.current.start() })
    expect(f.result.current.status).toBe('preparing')
    expect(createPurchaseIntent).toHaveBeenCalledExactlyOnceWith('https://api.example.com', 'sandbox')
    expect(sdk.open).not.toHaveBeenCalled()
    await act(async () => { pending.resolve({ kind: 'created', purchaseRef: 'private-purchase-ref' }); await start })
    expect(f.result.current.status).toBe('open')
    expect(sdk.open).toHaveBeenCalledExactlyOnceWith({
      settings: { displayMode: 'overlay', showAddDiscounts: true }, items: [{ priceId: 'pri_fixture', quantity: 1 }],
      customData: { purchase_ref: 'private-purchase-ref' },
      customer: { email: 'learner@example.com' },
    })
    expect(sdk.initialize).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox' }))
    expect(f.result.current.environment).toBe('sandbox')
    expect(f.refresh).not.toHaveBeenCalled()
  })

  it('exposes the live environment and maps it to the SDK\'s "production" value, per configured live credentials', async () => {
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'live')
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'live_fixture')
    const f = fixture()
    expect(f.result.current.environment).toBe('live')
    expect(f.result.current.configured).toBe(true)
    await f.start()
    expect(createPurchaseIntent).toHaveBeenCalledWith('https://api.example.com', 'live')
    expect(sdk.initialize).toHaveBeenCalledWith(expect.objectContaining({ environment: 'production', token: 'live_fixture' }))
  })

  it('a live environment paired with a sandbox-prefixed token fails closed -- environment is null, not guessed', async () => {
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'live')
    // VITE_PADDLE_CLIENT_TOKEN stays 'test_fixture' from beforeEach -- mismatched for 'live'.
    const f = fixture()
    expect(f.result.current.configured).toBe(false)
    expect(f.result.current.environment).toBe(null)
    await f.start()
    expect(sdk.initialize).not.toHaveBeenCalled()
  })

  it.each(['signed-out', 'active', 'loading', 'unavailable'] as const)('rejects purchase attempts while %s', async (status) => {
    const state: EntitlementState = status === 'signed-out' ? { status, user: null } : { status, user }
    const f = fixture(state)
    await f.start()
    expect(createPurchaseIntent).not.toHaveBeenCalled()
    expect(sdk.initialize).not.toHaveBeenCalled()
  })

  it('fails closed without configuration', async () => {
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'production')
    const f = fixture()
    await f.start()
    expect(f.result.current.configured).toBe(false)
    expect(createPurchaseIntent).not.toHaveBeenCalled()
  })

  it('treats an intent 401 as signed out and never loads Paddle', async () => {
    vi.mocked(createPurchaseIntent).mockResolvedValueOnce({ kind: 'signed-out' })
    const f = fixture()
    await f.start()
    expect(f.markSignedOut).toHaveBeenCalledOnce()
    expect(sdk.initialize).not.toHaveBeenCalled()
    expect(f.result.current.status).toBe('idle')
  })

  it('makes an unavailable intent recoverable with a fresh purchase attempt', async () => {
    vi.mocked(createPurchaseIntent).mockResolvedValueOnce({ kind: 'unavailable' })
    const f = fixture()
    await f.start()
    expect(f.result.current.status).toBe('unavailable')
    expect(sdk.open).not.toHaveBeenCalled()
    await f.start()
    expect(f.result.current.status).toBe('open')
    expect(createPurchaseIntent).toHaveBeenCalledTimes(2)
  })

  it('a server-asserted environment mismatch fails closed to unavailable -- checkout never opens, no purchase_ref is stored', async () => {
    vi.mocked(createPurchaseIntent).mockResolvedValueOnce({ kind: 'environment-mismatch' })
    const f = fixture()
    await f.start()
    expect(f.result.current.status).toBe('unavailable')
    expect(sdk.open).not.toHaveBeenCalled()
    expect(sdk.initialize).not.toHaveBeenCalled()
  })

  it('an environment mismatch is recoverable with a fresh purchase attempt, matching the unavailable-intent behavior', async () => {
    vi.mocked(createPurchaseIntent).mockResolvedValueOnce({ kind: 'environment-mismatch' })
    const f = fixture()
    await f.start()
    expect(f.result.current.status).toBe('unavailable')
    await f.start()
    expect(f.result.current.status).toBe('open')
    expect(createPurchaseIntent).toHaveBeenCalledTimes(2)
  })

  it('requires loaded/completed correlation before starting server confirmation', async () => {
    const f = fixture()
    await f.start()
    act(() => callbacks.at(-1)?.(event('checkout.completed')))
    expect(f.refresh).not.toHaveBeenCalled()
    expect(f.result.current.status).toBe('unavailable')
    expect(sdk.close).toHaveBeenCalledOnce()
  })

  it('completion only enters Processing and uses one returned applied verification to finish', async () => {
    const f = fixture()
    const pending = deferred<EntitlementRefreshResult>()
    f.refresh.mockReturnValueOnce(pending.promise)
    await f.start()
    await f.complete()
    expect(f.result.current.status).toBe('processing')
    expect(f.refresh).toHaveBeenCalledExactlyOnceWith({ nonDisruptive: true, signal: expect.any(AbortSignal) })
    await act(async () => { pending.resolve({ kind: 'applied', state: active }) })
    expect(f.result.current.status).toBe('idle')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(f.refresh).toHaveBeenCalledOnce()
    expect(createPurchaseIntent).toHaveBeenCalledOnce()
  })

  it('polls after 0, 1, 2, 4, 8, 15 seconds and Retry repeats confirmation without an intent', async () => {
    const f = fixture()
    f.refresh.mockResolvedValueOnce({ kind: 'unavailable' })
    await f.start()
    await f.complete()
    expect(f.refresh).toHaveBeenCalledTimes(1)
    for (const [index, delay] of [1000, 2000, 4000, 8000, 15000].entries()) {
      await act(async () => { await vi.advanceTimersByTimeAsync(delay - 1) })
      expect(f.refresh).toHaveBeenCalledTimes(index + 1)
      expect(f.result.current.status).toBe('processing')
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(f.refresh).toHaveBeenCalledTimes(index + 2)
    }
    expect(f.result.current.status).toBe('still-confirming')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(f.refresh).toHaveBeenCalledTimes(6)
    f.refresh.mockResolvedValueOnce({ kind: 'applied', state: active })
    await act(async () => { f.result.current.retry(); f.result.current.retry() })
    expect(f.refresh).toHaveBeenCalledTimes(7)
    expect(f.result.current.status).toBe('idle')
    expect(createPurchaseIntent).toHaveBeenCalledOnce()
    expect(sdk.open).toHaveBeenCalledOnce()
  })

  it('a stale verification never unlocks or continues that polling generation', async () => {
    const f = fixture()
    f.refresh.mockResolvedValueOnce({ kind: 'stale' })
    await f.start()
    await f.complete()
    expect(f.result.current.status).toBe('still-confirming')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(f.refresh).toHaveBeenCalledOnce()
  })

  it('ignores an SDK auto-close after correlated completion and continues server confirmation', async () => {
    const f = fixture()
    await f.start()
    await f.complete()
    act(() => callbacks.at(-1)?.(event('checkout.closed')))
    expect(f.result.current.status).toBe('processing')
    f.refresh.mockResolvedValueOnce({ kind: 'applied', state: active })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(f.result.current.status).toBe('idle')
    expect(f.refresh).toHaveBeenCalledTimes(2)
  })

  it.each(['cancel', 'invalidate', 'unmount', 'signed-out'] as const)('%s aborts in-flight verification and ignores late responses/callbacks', async (action) => {
    const f = fixture()
    const pending = deferred<EntitlementRefreshResult>()
    f.refresh.mockReturnValueOnce(pending.promise)
    await f.start()
    const oldCallback = callbacks.at(-1)!
    await f.complete()
    expect(f.refresh).toHaveBeenCalledOnce()
    const signal = f.refresh.mock.calls[0][0]?.signal
    act(() => {
      if (action === 'unmount') f.unmount()
      else if (action === 'signed-out') f.setState({ status: 'signed-out', user: null })
      else f.result.current[action]()
    })
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      pending.resolve({ kind: 'applied', state: active })
      oldCallback(event('checkout.completed'))
      await vi.advanceTimersByTimeAsync(60_000)
    })
    if (action !== 'unmount') expect(f.result.current.status).toBe('idle')
    expect(f.refresh).toHaveBeenCalledOnce()
    expect(sdk.close).toHaveBeenCalledOnce()
  })

  it('cancellation wakes pending waits without leaving timers or making another refresh', async () => {
    const f = fixture()
    await f.start()
    await f.complete()
    expect(vi.getTimerCount()).toBe(1)
    act(() => f.result.current.cancel())
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(f.refresh).toHaveBeenCalledOnce()
  })

  it('late intent resolution after invalidation cannot open Checkout', async () => {
    const f = fixture()
    const pending = deferred<Awaited<ReturnType<typeof createPurchaseIntent>>>()
    vi.mocked(createPurchaseIntent).mockReturnValueOnce(pending.promise)
    let start!: Promise<void>
    act(() => { start = f.result.current.start() })
    act(() => f.result.current.invalidate())
    await act(async () => { pending.resolve({ kind: 'created', purchaseRef: 'late-ref' }); await start })
    expect(f.result.current.status).toBe('idle')
    expect(sdk.open).not.toHaveBeenCalled()
  })

  it('closed checkout and old callbacks cannot confirm a new attempt', async () => {
    const f = fixture()
    await f.start()
    const oldCallback = callbacks.at(-1)!
    expect(oldCallback).toBeTypeOf('function')
    act(() => oldCallback(event('checkout.closed')))
    expect(f.result.current.status).toBe('idle')
    await f.start()
    act(() => { oldCallback(event('checkout.loaded')); oldCallback(event('checkout.completed')) })
    expect(f.result.current.status).toBe('open')
    expect(f.refresh).not.toHaveBeenCalled()
    expect(createPurchaseIntent).toHaveBeenCalledTimes(2)
    expect(sdk.open).toHaveBeenCalledTimes(2)
    expect(sdk.initialize).toHaveBeenCalledOnce()
  })

  it('an old poll cannot overwrite or interfere with a new purchase attempt', async () => {
    const f = fixture()
    const pending = deferred<EntitlementRefreshResult>()
    f.refresh.mockReturnValueOnce(pending.promise)
    await f.start()
    await f.complete()
    act(() => f.result.current.cancel())
    await f.start()
    await act(async () => { pending.resolve({ kind: 'applied', state: active }) })
    expect(f.result.current.status).toBe('open')
    expect(f.refresh).toHaveBeenCalledOnce()
    expect(createPurchaseIntent).toHaveBeenCalledTimes(2)
  })

  it('recreates its controller after StrictMode cleanup', async () => {
    const f = fixture(inactive, true)
    await f.start()
    expect(f.result.current.status).toBe('open')
    expect(createPurchaseIntent).toHaveBeenCalledOnce()
    expect(sdk.open).toHaveBeenCalledOnce()
  })
})
