import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useEntitlement } from '../components/EntitlementContext'
import { createPurchaseIntent } from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'
import { createSandboxCheckoutController } from '../lib/paddle/sandboxCheckoutController'
import { readProductionSandboxConfig } from '../lib/paddle/sandboxConfig'

type PurchaseStatus = 'idle' | 'preparing' | 'open' | 'processing' | 'still-confirming' | 'unavailable'
type PurchaseActions = {
  start: () => Promise<void>
  retry: () => void
  invalidate: () => void
}

/** Wake cancelled waits immediately, also removing their timer and listener. */
function waitForConfirmation(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return }
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, delay)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/** Account stores semantic status only; raw correlation belongs to the controller. */
export function useProductionSandboxPurchase() {
  const { state, refresh, markSignedOut } = useEntitlement()
  const apiBase = readProductionAuthApiBase()
  const [config] = useState(readProductionSandboxConfig)
  const [status, setStatus] = useState<PurchaseStatus>('idle')
  const sessionStatus = useRef(state.status)
  const actions = useRef<PurchaseActions | null>(null)

  useLayoutEffect(() => {
    sessionStatus.current = state.status
    if (state.status === 'signed-out' || state.status === 'active') actions.current?.invalidate()
  }, [state.status])

  useLayoutEffect(() => {
    if ('error' in config || !apiBase) return
    let disposed = false
    let generation = 0
    let currentStatus: PurchaseStatus = 'idle'
    let polling: AbortController | null = null
    const changeStatus = (next: PurchaseStatus) => {
      currentStatus = next
      if (!disposed) setStatus(next)
    }
    const invalidate = () => {
      ++generation
      polling?.abort()
      polling = null
      controller.invalidate()
      changeStatus('idle')
    }
    const isCurrent = (attempt: number) => !disposed && attempt === generation

    async function confirm() {
      polling?.abort()
      const abort = new AbortController()
      polling = abort
      const attempt = ++generation
      changeStatus('processing')
      for (const delay of [0, 1000, 2000, 4000, 8000, 15000]) {
        if (delay) await waitForConfirmation(delay, abort.signal)
        if (!isCurrent(attempt) || abort.signal.aborted) return
        // Provider performs AND applies the one verification for this attempt.
        const result = await refresh({ nonDisruptive: true, signal: abort.signal })
        if (!isCurrent(attempt) || abort.signal.aborted) return
        if (result.kind === 'stale') {
          changeStatus('still-confirming')
          return
        }
        if (result.kind === 'unavailable') continue
        if (result.state.status === 'active' || result.state.status === 'signed-out') {
          invalidate()
          return
        }
      }
      if (isCurrent(attempt)) changeStatus('still-confirming')
    }

    const controller = createSandboxCheckoutController({
      config,
      onEvent: (event) => {
        if (disposed) return
        switch (event.kind) {
          case 'preparing': case 'ready': case 'opening': changeStatus('preparing'); break
          case 'open': case 'loaded': changeStatus('open'); break
          // Completion ends checkout correlation. The controller ignores later
          // SDK closes (including auto-close); Account cancellation still aborts.
          case 'completed': void confirm(); break
          case 'closed': invalidate(); break
          case 'mismatch': case 'unavailable':
            invalidate()
            changeStatus('unavailable')
            break
        }
      },
    })

    actions.current = {
      start: async () => {
        if (disposed || sessionStatus.current !== 'inactive' || !['idle', 'unavailable'].includes(currentStatus)) return
        invalidate()
        const attempt = generation
        const prepared = await controller.prepare(async () => {
          const result = await createPurchaseIntent(apiBase)
          if (!isCurrent(attempt)) return null
          if (result.kind === 'signed-out') {
            invalidate()
            markSignedOut()
          }
          return result.kind === 'created' ? result.purchaseRef : null
        })
        if (prepared && isCurrent(attempt)) await controller.open()
      },
      retry: () => {
        if (!disposed && currentStatus === 'still-confirming') void confirm()
      },
      invalidate,
    }
    return () => {
      disposed = true
      invalidate()
      controller.dispose()
      actions.current = null
    }
  }, [apiBase, config, markSignedOut, refresh])

  const start = useCallback(async () => { await actions.current?.start() }, [])
  const retry = useCallback(() => actions.current?.retry(), [])
  const invalidate = useCallback(() => actions.current?.invalidate(), [])
  // Phase H2: exposes which environment (sandbox/live) this build is
  // configured for, so Account UI copy can be environment-aware (test-
  // purchase language in Sandbox, ordinary purchase language in Live) --
  // null only when config itself is invalid/absent, matching `configured`.
  const environment = 'error' in config ? null : config.environment
  return { status, configured: !('error' in config) && !!apiBase, environment, start, retry, cancel: invalidate, invalidate }
}
