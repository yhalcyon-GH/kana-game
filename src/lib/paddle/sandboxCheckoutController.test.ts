import { describe, expect, it, vi } from 'vitest'
import type { InitializePaddleOptions, Paddle, PaddleEventData, PaddleSetupOptions } from '@paddle/paddle-js'
import { createSandboxCheckoutController, type SandboxCheckoutEvent } from './sandboxCheckoutController'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function event(name: string, ref = 'private-ref', transaction = 'txn_1'): PaddleEventData {
  return { name, data: { id: 'che_fixture', transaction_id: transaction, custom_data: { purchase_ref: ref } } } as PaddleEventData
}

function fixture(environment: 'sandbox' | 'live' = 'sandbox', token = 'test_fixture') {
  const callbacks: Array<(event: PaddleEventData) => void> = []
  const events: SandboxCheckoutEvent[] = []
  const open = vi.fn()
  const close = vi.fn()
  const update = vi.fn((options: Partial<PaddleSetupOptions>) => { if (options.eventCallback) callbacks.push(options.eventCallback) })
  const paddle = { Initialized: true, Checkout: { open, close }, Update: update } as unknown as Paddle
  const initialize = vi.fn(async (options?: InitializePaddleOptions) => {
    if (options?.eventCallback) callbacks.push(options.eventCallback)
    return paddle
  })
  const loadPaddle = vi.fn(async () => ({ initializePaddle: initialize }))
  const controller = createSandboxCheckoutController({ config: { environment, token, priceId: 'pri_fixture' }, loadPaddle, onEvent: (value) => events.push(value) })
  const prepare = (ref = 'private-ref') => controller.prepare(async () => ref)
  const emit = (name: string, ref?: string, transaction?: string) => callbacks.at(-1)?.(event(name, ref, transaction))
  return { controller, prepare, emit, callbacks, events, open, close, update, initialize, loadPaddle, paddle }
}

describe('Sandbox checkout controller', () => {
  it('loads Paddle only on open, initializes sandbox once and sends exactly purchase_ref', async () => {
    const f = fixture()
    expect(f.loadPaddle).not.toHaveBeenCalled()
    expect(await f.prepare()).toBe(true)
    expect(f.loadPaddle).not.toHaveBeenCalled()
    await f.controller.open()
    expect(f.initialize).toHaveBeenCalledExactlyOnceWith({ environment: 'sandbox', token: 'test_fixture', eventCallback: expect.any(Function) })
    expect(f.open).toHaveBeenCalledExactlyOnceWith({ settings: { displayMode: 'overlay', showAddDiscounts: true }, items: [{ priceId: 'pri_fixture', quantity: 1 }], customData: { purchase_ref: 'private-ref' } })
    f.controller.cancel()
    await f.prepare('private-next')
    await f.controller.open()
    expect(f.initialize).toHaveBeenCalledTimes(1)
    expect(f.loadPaddle).toHaveBeenCalledTimes(1)
  })

  it('prefills the authenticated email as a customer hint, never as part of custom_data/correlation', async () => {
    const f = fixture()
    await f.prepare('private-ref')
    await f.controller.open('learner@example.com')
    const options = f.open.mock.calls[0][0]
    expect(options.customer).toEqual({ email: 'learner@example.com' })
    expect(options.customData).toEqual({ purchase_ref: 'private-ref' })
  })

  it('omits customer entirely when no email is known, rather than sending an empty value', async () => {
    const f = fixture()
    await f.prepare('private-ref')
    await f.controller.open()
    expect(f.open.mock.calls[0][0]).not.toHaveProperty('customer')
  })

  it('makes promo-code entry explicit without changing or exposing correlation data', async () => {
    const f = fixture()
    await f.prepare('private-ref')
    await f.controller.open()
    const options = f.open.mock.calls[0][0]
    expect(options.settings).toEqual({ displayMode: 'overlay', showAddDiscounts: true })
    expect(options.customData).toEqual({ purchase_ref: 'private-ref' })
    expect(options).not.toHaveProperty('discountCode')
    expect(options).not.toHaveProperty('discountId')
  })

  it('guards duplicate preparation and open synchronously while initialization is pending', async () => {
    const f = fixture()
    const intent = deferred<string | null>()
    const first = f.controller.prepare(() => intent.promise)
    const duplicate = vi.fn(async () => 'other-ref')
    expect(await f.controller.prepare(duplicate)).toBe(false)
    expect(duplicate).not.toHaveBeenCalled()
    intent.resolve('private-ref')
    await first
    const init = deferred<Paddle>()
    f.initialize.mockImplementationOnce(async (options) => { f.callbacks.push(options!.eventCallback!); return init.promise })
    const opening = f.controller.open()
    await f.controller.open()
    init.resolve(f.paddle)
    await opening
    expect(f.initialize).toHaveBeenCalledTimes(1)
    expect(f.open).toHaveBeenCalledTimes(1)
  })

  it('emits identifier-free completion only after matching loaded transaction and ref', async () => {
    const f = fixture()
    await f.prepare()
    await f.controller.open()
    f.emit('checkout.loaded')
    f.emit('checkout.completed')
    expect(f.events).toEqual([{ kind: 'preparing' }, { kind: 'ready' }, { kind: 'opening' }, { kind: 'open' }, { kind: 'loaded' }, { kind: 'completed' }])
    expect(JSON.stringify(f.events)).not.toMatch(/private-ref|txn_1|che_fixture/)
    f.emit('checkout.completed')
    await f.controller.open()
    expect(f.events.filter((value) => value.kind === 'completed')).toHaveLength(1)
    expect(f.open).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['loaded', 'wrong-ref', 'txn_1', false],
    ['loaded', 'private-ref', '', false],
    ['completed', 'wrong-ref', 'txn_1', true],
    ['completed', 'private-ref', 'txn_other', true],
    ['completed', 'private-ref', 'txn_1', false],
  ])('closes mismatched %s events (ref %s, transaction %s, previously loaded %s)', async (phase, ref, transaction, loaded) => {
    const f = fixture()
    await f.prepare()
    await f.controller.open()
    if (loaded) f.emit('checkout.loaded')
    f.emit(`checkout.${phase}`, ref, transaction)
    expect(f.close).toHaveBeenCalledTimes(1)
    expect(f.events.at(-1)).toMatchObject({ kind: 'mismatch', phase })
    f.emit('checkout.loaded')
    f.emit('checkout.completed')
    await f.controller.open()
    expect(f.events.some((value) => value.kind === 'completed')).toBe(false)
    expect(f.open).toHaveBeenCalledTimes(1)
  })

  it.each(['close', 'cancel', 'invalidate', 'dispose'] as const)('%s clears raw correlation and blocks callbacks/reopen', async (action) => {
    const f = fixture()
    await f.prepare()
    await f.controller.open()
    f.emit('checkout.loaded')
    if (action === 'close') f.emit('checkout.closed')
    else f.controller[action]()
    const terminalEvents = [...f.events]
    f.emit('checkout.loaded')
    f.emit('checkout.completed')
    await f.controller.open()
    expect(f.events).toEqual(terminalEvents)
    expect(f.open).toHaveBeenCalledTimes(1)
    if (action !== 'close') expect(f.close).toHaveBeenCalledTimes(1)
    if (action === 'dispose') expect(await f.prepare('next-ref')).toBe(false)
  })

  it('old callback closures cannot close, mismatch, load or complete a new generation', async () => {
    const f = fixture()
    await f.prepare()
    await f.controller.open()
    const oldCallback = f.callbacks.at(-1)!
    f.controller.invalidate()
    await f.prepare('new-ref')
    await f.controller.open()
    const before = [...f.events]
    for (const name of ['checkout.closed', 'checkout.loaded', 'checkout.completed']) oldCallback(event(name))
    expect(f.events).toEqual(before)
    expect(f.close).toHaveBeenCalledTimes(1)
    f.emit('checkout.loaded', 'new-ref', 'txn_2')
    f.emit('checkout.completed', 'new-ref', 'txn_2')
    expect(f.events.at(-1)).toEqual({ kind: 'completed' })
  })

  it('late intent responses cannot replace the next prepared reference', async () => {
    const f = fixture()
    const intent = deferred<string | null>()
    const old = f.controller.prepare(() => intent.promise)
    f.controller.invalidate()
    await f.prepare('new-ref')
    intent.resolve('old-ref')
    expect(await old).toBe(false)
    await f.controller.open()
    expect(f.open.mock.calls[0][0].customData).toEqual({ purchase_ref: 'new-ref' })
  })

  it('shares pending initialization across generations without opening the stale attempt', async () => {
    const f = fixture()
    const init = deferred<Paddle>()
    f.initialize.mockImplementationOnce(async (options) => { f.callbacks.push(options!.eventCallback!); return init.promise })
    await f.prepare()
    const old = f.controller.open()
    f.controller.invalidate()
    await f.prepare('new-ref')
    const next = f.controller.open()
    init.resolve(f.paddle)
    await Promise.all([old, next])
    expect(f.initialize).toHaveBeenCalledTimes(1)
    expect(f.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ customData: { purchase_ref: 'new-ref' } }))
    f.callbacks[0](event('checkout.closed'))
    f.emit('checkout.loaded', 'new-ref')
    f.emit('checkout.completed', 'new-ref')
    expect(f.events.at(-1)).toEqual({ kind: 'completed' })
  })

  it('disposal while initialization is pending prevents open and further events', async () => {
    const f = fixture()
    const init = deferred<Paddle>()
    f.initialize.mockImplementationOnce(async () => init.promise)
    await f.prepare()
    const pending = f.controller.open()
    await Promise.resolve()
    expect(f.initialize).toHaveBeenCalledTimes(1)
    f.controller.dispose()
    const before = [...f.events]
    init.resolve(f.paddle)
    await pending
    expect(f.open).not.toHaveBeenCalled()
    expect(f.events).toEqual(before)
  })

  it('disposal also closes an overlay showing the completed checkout', async () => {
    const f = fixture()
    await f.prepare()
    await f.controller.open()
    f.emit('checkout.loaded')
    f.emit('checkout.completed')
    expect(f.events.at(-1)).toEqual({ kind: 'completed' })
    f.controller.dispose()
    expect(f.close).toHaveBeenCalledTimes(1)
  })

  it('failed initialization is sanitized and permits a fresh intent and initialization retry', async () => {
    const f = fixture()
    f.initialize.mockRejectedValueOnce(new Error('private-ref'))
    await f.prepare()
    await f.controller.open()
    expect(f.events.at(-1)).toEqual({ kind: 'unavailable' })
    expect(JSON.stringify(f.events)).not.toContain('private-ref')
    await f.prepare('next-ref')
    await f.controller.open()
    expect(f.initialize).toHaveBeenCalledTimes(2)
    expect(f.open).toHaveBeenCalledTimes(1)
  })

  it('null/rejected intent and missing reference never load Paddle', async () => {
    const f = fixture()
    await f.controller.open()
    expect(await f.controller.prepare(async () => null)).toBe(false)
    expect(await f.controller.prepare(async () => { throw new Error('private-ref') })).toBe(false)
    await f.controller.open()
    expect(f.loadPaddle).not.toHaveBeenCalled()
    expect(f.events.at(-1)).toEqual({ kind: 'unavailable' })
  })

  // -- Phase H2: environment mapping at the Paddle SDK boundary --

  it('maps the live config environment to the SDK\'s "production" value -- Paddle\'s own SDK has no "live" value', async () => {
    const f = fixture('live', 'live_fixture')
    await f.prepare()
    await f.controller.open()
    expect(f.initialize).toHaveBeenCalledExactlyOnceWith({ environment: 'production', token: 'live_fixture', eventCallback: expect.any(Function) })
  })

  it('keeps the sandbox config environment mapped to the SDK\'s "sandbox" value', async () => {
    const f = fixture('sandbox', 'test_fixture')
    await f.prepare()
    await f.controller.open()
    expect(f.initialize).toHaveBeenCalledExactlyOnceWith({ environment: 'sandbox', token: 'test_fixture', eventCallback: expect.any(Function) })
  })
})
