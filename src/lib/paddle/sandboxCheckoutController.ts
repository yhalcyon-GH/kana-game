import type { initializePaddle, Paddle, PaddleEventData } from '@paddle/paddle-js'
import type { PaddleCheckoutEnvironment } from './sandboxConfig'

export type SandboxCheckoutEvent =
  | { kind: 'preparing' | 'ready' | 'opening' | 'open' | 'loaded' | 'completed' | 'closed' | 'unavailable' }
  | { kind: 'mismatch'; phase: 'loaded' | 'completed'; transactionMatches: boolean; purchaseRefMatches: boolean }

export type SandboxCheckoutOptions = {
  config: { environment: PaddleCheckoutEnvironment; token: string; priceId: string }
  onEvent: (event: SandboxCheckoutEvent) => void
  loadPaddle?: () => Promise<{ initializePaddle: typeof initializePaddle }>
}

// Paddle's own SDK environment enum is 'sandbox' | 'production' (there is
// no 'live' value at the SDK level) -- confirmed against the installed
// @paddle/paddle-js package's own type definitions
// (node_modules/@paddle/paddle-js/types/index.d.ts: `Environments =
// 'production' | 'sandbox'`). This app's config-level environment name
// ('live', matching Paddle's own dashboard/workspace terminology and this
// project's config keys) is mapped to the SDK's 'production' only at this
// one call site -- never anywhere else.
function toSdkEnvironment(environment: PaddleCheckoutEnvironment): 'sandbox' | 'production' {
  return environment === 'live' ? 'production' : 'sandbox'
}

/** Owns sensitive correlation in memory; consumers receive semantic events only. */
export function createSandboxCheckoutController({ config, onEvent, loadPaddle = () => import('@paddle/paddle-js') }: SandboxCheckoutOptions) {
  let generation = 0
  let disposed = false
  let preparing = false
  let active = false
  let overlayOpen = false
  let purchaseRef: string | null = null
  let transactionId: string | null = null
  let paddle: Paddle | undefined
  let initialization: Promise<Paddle> | null = null

  const isCurrent = (attempt: number) => !disposed && attempt === generation

  function clearAttempt(closeOverlay: boolean) {
    generation += 1
    preparing = false
    active = false
    purchaseRef = null
    transactionId = null
    // Invalidate BEFORE closing: the SDK may synchronously dispatch closed.
    if (closeOverlay && overlayOpen) {
      overlayOpen = false
      try { paddle?.Checkout.close() } catch { /* Correlation is already cleared. */ }
    }
  }

  function invalidate() {
    clearAttempt(true)
  }

  function finish(event: SandboxCheckoutEvent, close: boolean) {
    clearAttempt(close)
    if (!disposed) onEvent(event)
  }

  function handleEvent(attempt: number, event: PaddleEventData) {
    if (!isCurrent(attempt) || !active) return
    if (event.name === 'checkout.closed') {
      overlayOpen = false
      finish({ kind: 'closed' }, false)
      return
    }
    if (event.name !== 'checkout.loaded' && event.name !== 'checkout.completed') return
    const phase = event.name === 'checkout.loaded' ? 'loaded' : 'completed'
    const incomingId = event.data?.transaction_id
    const incomingRef = (event.data?.custom_data as { purchase_ref?: unknown } | null | undefined)?.purchase_ref
    const purchaseRefMatches = purchaseRef !== null && incomingRef === purchaseRef
    const transactionMatches = phase === 'loaded'
      ? typeof incomingId === 'string' && incomingId.length > 0 && (transactionId === null || incomingId === transactionId)
      : transactionId !== null && incomingId === transactionId
    if (!purchaseRefMatches || !transactionMatches) {
      finish({ kind: 'mismatch', phase, transactionMatches, purchaseRefMatches }, true)
      return
    }
    if (phase === 'loaded') {
      transactionId = incomingId!
      onEvent({ kind: 'loaded' })
    } else {
      // A completion signal is only permission to check server entitlement.
      finish({ kind: 'completed' }, false)
    }
  }

  async function prepare(loadPurchaseRef: () => Promise<string | null>): Promise<boolean> {
    if (disposed || preparing || active) return false
    invalidate()
    const attempt = generation
    preparing = true
    onEvent({ kind: 'preparing' })
    if (!isCurrent(attempt)) return false
    try {
      const result = await loadPurchaseRef()
      if (!isCurrent(attempt)) return false
      if (!result) {
        finish({ kind: 'unavailable' }, false)
        return false
      }
      purchaseRef = result
      preparing = false
      onEvent({ kind: 'ready' })
      return isCurrent(attempt)
    } catch {
      if (isCurrent(attempt)) finish({ kind: 'unavailable' }, false)
      return false
    }
  }

  async function open(): Promise<void> {
    if (disposed || preparing || active || !purchaseRef) return
    const attempt = generation
    active = true
    onEvent({ kind: 'opening' })
    if (!isCurrent(attempt)) return
    const eventCallback = (event: PaddleEventData) => handleEvent(attempt, event)
    try {
      if (!initialization) {
        const pending = loadPaddle().then(({ initializePaddle }) => initializePaddle({
          environment: toSdkEnvironment(config.environment), token: config.token, eventCallback,
        })).then((instance) => {
          if (!instance?.Initialized) throw new Error('Paddle unavailable')
          return instance
        }).catch((error: unknown) => {
          if (initialization === pending) initialization = null
          throw error
        })
        initialization = pending
      }
      const instance = await initialization
      if (!isCurrent(attempt)) return
      paddle = instance
      // Update the callback, not Paddle initialization. Old callback closures
      // retain their original generation and are inert after invalidation.
      paddle.Update({ eventCallback })
      if (!isCurrent(attempt) || !purchaseRef) return
      onEvent({ kind: 'open' })
      if (!isCurrent(attempt) || !purchaseRef) return
      overlayOpen = true
      paddle.Checkout.open({
        // Explicit, not the SDK default: the customer's own "Add discount"
        // affordance must stay visible so Paddle standard discount codes
        // (including 100%-off promotions) remain a checkout-side, no-deploy
        // mechanism. This never widens what data leaves the client -- only
        // purchase_ref is still sent as customData.
        settings: { displayMode: 'overlay', showAddDiscounts: true },
        items: [{ priceId: config.priceId, quantity: 1 }],
        customData: { purchase_ref: purchaseRef },
      })
    } catch {
      if (isCurrent(attempt)) finish({ kind: 'unavailable' }, true)
    }
  }

  return {
    prepare,
    open,
    cancel: () => { if (!disposed) finish({ kind: 'closed' }, true) },
    invalidate,
    dispose: () => { disposed = true; invalidate() },
  }
}

export type SandboxCheckoutController = ReturnType<typeof createSandboxCheckoutController>
