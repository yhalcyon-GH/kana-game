import type { initializePaddle, Paddle, PaddleEventData } from '@paddle/paddle-js'
import type { PaddleCheckoutEnvironment } from './sandboxConfig'

export type CheckoutSummary = {
  currencyCode: string
  subtotal: number
  discount: number
  tax: number
  total: number
}

export type SandboxCheckoutEvent =
  | { kind: 'preparing' | 'ready' | 'opening' | 'open' | 'loaded' | 'completed' | 'closed' | 'unavailable' | 'promotion-unavailable' }
  | { kind: 'summary'; summary: CheckoutSummary }
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

function readCheckoutSummary(data: unknown): CheckoutSummary | null {
  if (!data || typeof data !== 'object') return null
  const checkout = data as { currency_code?: unknown; totals?: unknown }
  if (typeof checkout.currency_code !== 'string' || !checkout.totals || typeof checkout.totals !== 'object') return null

  const totals = checkout.totals as Record<string, unknown>
  const values = [totals.subtotal, totals.discount, totals.tax, totals.total]
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return null

  return {
    currencyCode: checkout.currency_code,
    subtotal: totals.subtotal as number,
    discount: totals.discount as number,
    tax: totals.tax as number,
    total: totals.total as number,
  }
}

/** Owns sensitive correlation in memory; consumers receive semantic events only. */
export function createSandboxCheckoutController({ config, onEvent, loadPaddle = () => import('@paddle/paddle-js') }: SandboxCheckoutOptions) {
  let generation = 0
  let disposed = false
  let preparing = false
  let active = false
  let checkoutOpen = false
  let purchaseRef: string | null = null
  let transactionId: string | null = null
  let promotionExpected = false
  let paddle: Paddle | undefined
  let initialization: Promise<Paddle> | null = null

  const isCurrent = (attempt: number) => !disposed && attempt === generation

  function clearAttempt(closeOverlay: boolean) {
    generation += 1
    preparing = false
    active = false
    purchaseRef = null
    transactionId = null
    promotionExpected = false
    // Invalidate BEFORE closing: the SDK may synchronously dispatch closed.
    if (closeOverlay && checkoutOpen) {
      checkoutOpen = false
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
      checkoutOpen = false
      finish({ kind: 'closed' }, false)
      return
    }
    if (event.name === 'checkout.error') {
      finish({ kind: promotionExpected ? 'promotion-unavailable' : 'unavailable' }, true)
      return
    }

    const incomingId = event.data?.transaction_id
    if (event.name !== 'checkout.loaded' && event.name !== 'checkout.completed') {
      if (transactionId !== null && incomingId === transactionId) {
        const summary = readCheckoutSummary(event.data)
        if (summary) onEvent({ kind: 'summary', summary })
      }
      return
    }

    const phase = event.name === 'checkout.loaded' ? 'loaded' : 'completed'
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
      const summary = readCheckoutSummary(event.data)
      // A campaign link promises a discount. If Paddle loads the checkout
      // without one, fail closed instead of letting the buyer accidentally
      // complete a full-price purchase.
      if (promotionExpected && (!summary || summary.discount <= 0)) {
        finish({ kind: 'promotion-unavailable' }, true)
        return
      }
      if (summary) onEvent({ kind: 'summary', summary })
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

  async function open(customerEmail?: string, discountCode?: string, inlineTarget?: string): Promise<void> {
    if (disposed || preparing || active || !purchaseRef) return
    const attempt = generation
    active = true
    promotionExpected = Boolean(discountCode)
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
      checkoutOpen = true
      const settings = inlineTarget
        ? {
            displayMode: 'inline' as const,
            variant: 'one-page' as const,
            frameTarget: inlineTarget,
            frameInitialHeight: 520,
            frameStyle: 'width:100%; min-width:312px; background-color:transparent; border:none;',
            showAddDiscounts: false,
          }
        : { displayMode: 'overlay' as const, showAddDiscounts: false }
      paddle.Checkout.open({
        // Discount entry is intentionally hidden. Promotion recipients arrive
        // through Tamamizu campaign links and receive a prefilled discountCode;
        // Paddle documents that prefilled discounts still work when the manual
        // Add discount affordance is hidden.
        settings,
        items: [{ priceId: config.priceId, quantity: 1 }],
        customData: { purchase_ref: purchaseRef },
        // Public promotion data only. The caller validates the code before
        // passing it here; it never enters customData and never participates
        // in entitlement/correlation authority.
        ...(discountCode ? { discountCode } : {}),
        // Prefill only -- Paddle's own checkout.completed email is never
        // trusted as entitlement authority (see purchaseRef/customData
        // above, which is the only value the signed webhook resolves the
        // buyer from). Omitted entirely when the caller has no known
        // authenticated email, rather than sending an empty string.
        ...(customerEmail ? { customer: { email: customerEmail } } : {}),
      })
    } catch {
      if (isCurrent(attempt)) finish({ kind: discountCode ? 'promotion-unavailable' : 'unavailable' }, true)
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
