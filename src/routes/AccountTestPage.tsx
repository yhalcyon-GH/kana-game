import { initializePaddle, type Paddle, type PaddleEventData } from '@paddle/paddle-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createPurchaseIntent,
  fetchCurrentEntitlement,
  fetchCurrentUser,
  fetchDevHarnessMagicLink,
  logout,
  requestMagicLink,
  type CurrentUser,
} from '../lib/auth/authClient'
import { readAuthApiBase } from '../lib/auth/authApiBase'
import { readSandboxConfig } from '../lib/paddle/sandboxConfig'

type LinkRetrievalState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; url: string }
  | { kind: 'not-found' }

type EntitlementCheckState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; active: boolean }
  | { kind: 'error' }

/**
 * DEV-ONLY. Not a production account/login/purchase UI — see
 * docs/adr/0001-cross-site-auth-transport.md (production browser
 * session transport is a separate, later decision) and this route's
 * own compile-time exclusion in App.tsx (matching /paddle-test's
 * pattern). Proves, end to end, against a real deployed backend:
 * Magic Link -> session -> current user -> purchase intent -> Paddle
 * Sandbox checkout -> signed webhook -> entitlement -- without
 * choosing the final production session transport.
 *
 * The session token lives ONLY in inMemorySessionTransport -- never
 * localStorage/sessionStorage, never a URL. Client-side Paddle events
 * remain diagnostic only; entitlement is always read from
 * entitlement-me.php (the server-verified state), never inferred from
 * checkout.completed.
 */
export default function AccountTestPage() {
  const apiBase = readAuthApiBase()
  const sandboxConfig = readSandboxConfig('Phase 3 Sandbox Checkout is available only in development.')

  const [email, setEmail] = useState('')
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null)
  const [requestingLink, setRequestingLink] = useState(false)
  const [linkRetrieval, setLinkRetrieval] = useState<LinkRetrievalState>({ kind: 'idle' })
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [purchaseRef, setPurchaseRef] = useState<string | null>(null)
  const [entitlementCheck, setEntitlementCheck] = useState<EntitlementCheckState>({ kind: 'idle' })
  const [loadingUser, setLoadingUser] = useState(true)
  const [checkoutError, setCheckoutError] = useState('')
  const [checkoutStatus, setCheckoutStatus] = useState('')
  // True from the moment "Open Paddle Sandbox Checkout" is clicked until
  // this attempt reaches a terminal per-attempt state (closed, or a
  // completed/mismatch resolution -- see handleCheckoutEvent). Disables
  // both "Create purchase intent" and "Open Paddle Sandbox Checkout"
  // below so a second purchase intent, or a second Checkout.open() for
  // the current one, can never be created while an attempt is already
  // in flight -- this is what previously let an old, still-open
  // checkout overlay (for a stale purchase_ref) get completed after a
  // new purchase intent had already replaced it in state.
  const [checkoutActive, setCheckoutActive] = useState(false)
  // Once checkout.completed correlates successfully for a given
  // purchase_ref, "Open" stays disabled for THAT purchase_ref even
  // after checkoutActive clears -- only creating a new purchase intent
  // (a new purchase_ref) re-enables it, so a completed checkout can
  // never accidentally be reopened/reused.
  const [completedForRef, setCompletedForRef] = useState<string | null>(null)

  const mountedCheckout = useRef(false)
  const checkoutInstance = useRef<Paddle | undefined>(undefined)
  // initializePaddle() is called at most once per mount -- reused
  // (including its in-flight promise, to collapse racing double-clicks)
  // across every subsequent Checkout.open(), rather than re-initializing
  // a fresh Paddle instance per open as before.
  const paddleInitPromise = useRef<Promise<Paddle | undefined> | null>(null)
  // Mutable mirrors of the latest purchaseRef / tracked transaction id,
  // read by handleCheckoutEvent. initializePaddle's eventCallback is
  // registered at most once for the whole mount (see paddleInitPromise
  // above), so it must never rely on values closed over from that first
  // call -- refs are updated synchronously and read fresh on every event.
  const purchaseRefRef = useRef<string | null>(null)
  const trackedTransactionIdRef = useRef<string | null>(null)
  // Synchronous reentrancy guard mirroring `checkoutActive` (state).
  // React state updates are asynchronous, so a rapid double-click on
  // "Open" could pass the `disabled` check twice before a re-render
  // lands -- this ref is the actual source of truth checked/set
  // synchronously inside openPhase3Checkout; the `checkoutActive` state
  // exists only to drive the UI's disabled attributes.
  const checkoutActiveRef = useRef(false)

  useEffect(() => {
    purchaseRefRef.current = purchaseRef
  }, [purchaseRef])

  useEffect(() => {
    mountedCheckout.current = true
    return () => {
      mountedCheckout.current = false
      checkoutInstance.current?.Checkout.close()
    }
  }, [])

  // Releases the busy guard used while one checkout attempt is in
  // flight (open -> loaded -> completed/closed). Does NOT touch
  // `completedForRef` -- a successful completion keeps Open disabled
  // for that purchase_ref independently of this reset (see
  // `completedForRef`'s own comment above).
  function resetCheckoutLifecycle() {
    checkoutActiveRef.current = false
    trackedTransactionIdRef.current = null
    setCheckoutActive(false)
  }

  const refreshCurrentUser = useCallback(async () => {
    if (!apiBase) {
      setLoadingUser(false)
      return
    }
    setLoadingUser(true)
    const user = await fetchCurrentUser(apiBase)
    setCurrentUser(user)
    setLoadingUser(false)
  }, [apiBase])

  useEffect(() => {
    void refreshCurrentUser()
  }, [refreshCurrentUser])

  // requestedEmail (which gates showing the Retrieve button at all -- see
  // the JSX below) is set only AFTER requestMagicLink()'s await resolves,
  // never before -- request-link.php's own contract is "always 200,
  // never distinguish failure reasons" (see authClient.ts), so this
  // waits only for the request to have actually reached the server and
  // completed, not for any particular outcome. Retrieving before the
  // request has actually landed server-side would race against
  // dev_harness_magic_links not having a row yet, independent of and in
  // addition to that endpoint's own generic-response security contract
  // (server/dev-only/last-magic-link.php), which this change does not
  // touch.
  async function handleRequestLink() {
    if (!apiBase || !email || requestingLink) return
    setRequestingLink(true)
    setRequestedEmail(null)
    setLinkRetrieval({ kind: 'idle' })
    try {
      await requestMagicLink(apiBase, email)
      setRequestedEmail(email)
    } finally {
      setRequestingLink(false)
    }
  }

  async function handleRetrieveLink() {
    if (!apiBase || !requestedEmail) return
    setLinkRetrieval({ kind: 'loading' })
    const url = await fetchDevHarnessMagicLink(apiBase, requestedEmail)
    setLinkRetrieval(url ? { kind: 'found', url } : { kind: 'not-found' })
  }

  async function handleCreatePurchaseIntent() {
    // Also guarded by the `disabled` attribute below, but checked here
    // too (defense in depth) -- a purchase intent must never be
    // replaced while a checkout attempt for the current one is in
    // flight or tracking a transaction.
    if (!apiBase || checkoutActiveRef.current) return
    setPurchaseRef(null)
    setCheckoutError('')
    setCheckoutStatus('')
    setCompletedForRef(null)
    trackedTransactionIdRef.current = null
    const ref = await createPurchaseIntent(apiBase)
    setPurchaseRef(ref)
  }

  // Opens Paddle Sandbox Checkout for the Phase 3 real-user path. Only
  // ever callable once purchaseRef exists (see the disabled/guard below
  // and the JSX gating this whole section on `purchaseRef`) -- there is
  // no code path here that can open a checkout without one. customData
  // is exactly { purchase_ref: purchaseRef }: never internal_user_id,
  // never any other field, matching PurchaseWebhookHandler's contract
  // that only custom_data.purchase_ref is ever read on this path (see
  // server/src/Purchase/PurchaseWebhookHandler.php's own doc comment).
  // purchaseRef itself only ever lives in this component's React state
  // (and briefly in the Paddle Checkout call) -- never a URL, never
  // localStorage/sessionStorage, matching this file's existing session-
  // token handling.
  async function openPhase3Checkout() {
    if (!purchaseRef || 'error' in sandboxConfig || checkoutActiveRef.current) return
    checkoutActiveRef.current = true
    setCheckoutActive(true)
    setCheckoutError('')
    setCheckoutStatus('Loading Paddle Sandbox Checkout…')

    try {
      if (!paddleInitPromise.current) {
        paddleInitPromise.current = initializePaddle({
          environment: 'sandbox',
          token: sandboxConfig.token,
          eventCallback: handleCheckoutEvent,
        })
      }
      let paddle: Paddle | undefined
      try {
        paddle = await paddleInitPromise.current
      } catch (err) {
        // A failed initialize must not permanently wedge future opens
        // -- clear the cached promise so the next attempt retries it.
        paddleInitPromise.current = null
        throw err
      }
      if (!mountedCheckout.current) return
      if (!paddle?.Initialized) {
        paddleInitPromise.current = null
        throw new Error('Paddle did not initialize')
      }
      checkoutInstance.current = paddle
      trackedTransactionIdRef.current = null
      setCheckoutStatus('Checkout requested. Complete the test payment in the overlay.')
      paddle.Checkout.open({
        settings: { displayMode: 'overlay' },
        items: [{ priceId: sandboxConfig.priceId, quantity: 1 }],
        customData: { purchase_ref: purchaseRef },
      })
    } catch {
      if (mountedCheckout.current) {
        setCheckoutError('Could not open Paddle Sandbox Checkout. Check the sandbox configuration and network, then reload this page to retry.')
        setCheckoutStatus('Checkout unavailable.')
      }
      resetCheckoutLifecycle()
    }
  }

  // Registered (at most) once per mount as initializePaddle's
  // eventCallback -- must read purchaseRefRef/trackedTransactionIdRef
  // (never the purchaseRef/purchaseRef-derived state captured in this
  // closure's first invocation) so correlation always reflects the
  // CURRENT purchase intent, not whichever one was current when
  // initializePaddle first ran.
  function handleCheckoutEvent(event: PaddleEventData) {
    if (!mountedCheckout.current || !event.name) return

    if (event.name === 'checkout.loaded') {
      const eventTransactionId = event.data?.transaction_id
      const eventPurchaseRef = (event.data?.custom_data as { purchase_ref?: unknown } | null | undefined)?.purchase_ref
      const currentRef = purchaseRefRef.current
      const hasTransactionId = typeof eventTransactionId === 'string' && eventTransactionId !== ''
      const purchaseRefMatches = currentRef !== null && eventPurchaseRef === currentRef

      if (hasTransactionId && purchaseRefMatches) {
        trackedTransactionIdRef.current = eventTransactionId
        setCheckoutStatus('Checkout loaded and correlated.')
        setCheckoutError('')
        return
      }

      // Never trust an uncorrelated checkout -- close it and require an
      // explicit new purchase intent + Open, rather than silently
      // reopening or falling back to any other identity source.
      checkoutInstance.current?.Checkout.close()
      resetCheckoutLifecycle()
      setCheckoutStatus('Checkout unavailable.')
      setCheckoutError(
        `Checkout could not be correlated to the current purchase intent (transaction present: ${hasTransactionId}, purchase_ref match: ${purchaseRefMatches}). Closed for safety — create a new purchase intent to retry.`,
      )
      return
    }

    if (event.name === 'checkout.completed') {
      // Client events are diagnostic only and MUST NOT grant entitlement
      // -- see "3. Entitlement" below, which always reads
      // entitlement-me.php's server-verified state instead. This
      // correlation check only decides whether to show the diagnostic
      // "completed" status vs. a mismatch error; it never itself grants
      // anything.
      const eventTransactionId = event.data?.transaction_id
      const eventPurchaseRef = (event.data?.custom_data as { purchase_ref?: unknown } | null | undefined)?.purchase_ref
      const currentRef = purchaseRefRef.current
      const tracked = trackedTransactionIdRef.current
      const transactionMatch = tracked !== null && eventTransactionId === tracked
      const purchaseRefMatch = currentRef !== null && eventPurchaseRef === currentRef

      if (transactionMatch && purchaseRefMatch) {
        setCheckoutStatus('Checkout completed (sandbox). Entitlement is not granted client-side — check it below once the webhook has processed.')
        setCheckoutError('')
        if (currentRef !== null) setCompletedForRef(currentRef)
      } else {
        setCheckoutStatus('Checkout unavailable.')
        setCheckoutError(
          `Checkout completion could not be correlated to the current purchase intent (transaction match: ${transactionMatch}, purchase_ref match: ${purchaseRefMatch}). Not treated as a successful checkout — create a new purchase intent to retry.`,
        )
      }
      resetCheckoutLifecycle()
      return
    }

    if (event.name === 'checkout.closed') {
      resetCheckoutLifecycle()
    }
  }

  async function handleCheckEntitlement() {
    if (!apiBase) return
    setEntitlementCheck({ kind: 'loading' })
    const result = await fetchCurrentEntitlement(apiBase)
    setEntitlementCheck(result ? { kind: 'success', active: result.active } : { kind: 'error' })
  }

  async function handleLogout() {
    if (!apiBase) return
    checkoutInstance.current?.Checkout.close()
    resetCheckoutLifecycle()
    setCompletedForRef(null)
    await logout(apiBase)
    setCurrentUser(null)
    setPurchaseRef(null)
    setEntitlementCheck({ kind: 'idle' })
    setCheckoutError('')
    setCheckoutStatus('')
  }

  if (!apiBase) {
    return (
      <div className="flex w-full max-w-xl flex-col gap-4">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Development only · Account Test harness</p>
        <p role="alert" className="rounded-lg border border-amber-500 p-4">
          Configuration missing: VITE_PADDLE_AUTH_API_BASE_URL. Set this in .env.local and restart the dev server.
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Development only · Account Test harness</p>
      <h1 className="text-2xl font-bold">Account Test</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Current session</h2>
        {loadingUser ? (
          <p role="status">Checking session…</p>
        ) : currentUser ? (
          <>
            <p role="status">
              Signed in as <span>{currentUser.emailNormalized}</span>
            </p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="self-start rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 dark:border-neutral-600"
            >
              Log out
            </button>
          </>
        ) : (
          <p role="status">Not signed in.</p>
        )}
      </section>

      {!currentUser && (
        <section className="flex flex-col gap-3 border-t border-neutral-300 pt-5 dark:border-neutral-700">
          <h2 className="text-lg font-semibold">1. Request a test Magic Link</h2>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-neutral-400 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleRequestLink()}
            disabled={!email || requestingLink}
            className="self-start rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requestingLink ? 'Requesting…' : 'Request test Magic Link'}
          </button>

          {requestingLink && <p role="status">Requesting test Magic Link…</p>}

          {requestedEmail && (
            <div className="flex flex-col gap-2">
              <p role="status">
                Link requested for {requestedEmail}. Dev-only: retrieve it below (requires DEV_HARNESS_ENABLED on the server).
              </p>
              <button
                type="button"
                onClick={() => void handleRetrieveLink()}
                disabled={linkRetrieval.kind === 'loading'}
                className="self-start rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600"
              >
                Retrieve test link
              </button>
              {linkRetrieval.kind === 'found' && (
                <a
                  href={linkRetrieval.url}
                  className="self-start rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                >
                  Follow test sign-in link
                </a>
              )}
              {linkRetrieval.kind === 'not-found' && (
                <p role="alert">No pending link found. The dev harness may be disabled, or the link may have already been used/expired.</p>
              )}
            </div>
          )}
        </section>
      )}

      {currentUser && (
        <>
          <section className="flex flex-col gap-3 border-t border-neutral-300 pt-5 dark:border-neutral-700">
            <h2 className="text-lg font-semibold">2. Purchase intent</h2>
            <button
              type="button"
              onClick={() => void handleCreatePurchaseIntent()}
              disabled={checkoutActive}
              className="self-start rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create purchase intent
            </button>
            {purchaseRef && (
              <p className="text-sm">
                purchase_ref: <code data-testid="purchase-ref-value">{purchaseRef}</code>
                <br />
                This is the only identifier the browser sends Paddle for the real-user path — see the Sandbox Checkout
                below.
              </p>
            )}
          </section>

          {purchaseRef && (
            <section className="flex flex-col gap-3 border-t border-neutral-300 pt-5 dark:border-neutral-700">
              <h2 className="text-lg font-semibold">3. Paddle Sandbox Checkout</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Opens Paddle Sandbox Checkout with <code>customData: {'{'} purchase_ref {'}'}</code> only — never{' '}
                <code>internal_user_id</code>. The server's signed-webhook handler
                (<code>server/src/Purchase/PurchaseWebhookHandler.php</code>) resolves the purchasing user from this
                value alone.
              </p>
              {'error' in sandboxConfig && (
                <p role="alert" data-testid="sandbox-checkout-config-missing" className="rounded-lg border border-amber-500 p-4 text-sm">
                  {sandboxConfig.error}
                </p>
              )}
              {checkoutError && <p role="alert" className="rounded-lg border border-amber-500 p-4 text-sm">{checkoutError}</p>}
              <button
                type="button"
                onClick={() => void openPhase3Checkout()}
                disabled={'error' in sandboxConfig || checkoutActive || completedForRef === purchaseRef}
                className="self-start rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open Paddle Sandbox Checkout
              </button>
              {checkoutStatus && <p role="status">{checkoutStatus}</p>}
            </section>
          )}

          <section className="flex flex-col gap-3 border-t border-neutral-300 pt-5 dark:border-neutral-700">
            <h2 className="text-lg font-semibold">4. Entitlement (server-verified only)</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Client-side checkout events are diagnostic only and never set entitlement — this always reads the server's
              signed-webhook-verified state.
            </p>
            <button
              type="button"
              onClick={() => void handleCheckEntitlement()}
              disabled={entitlementCheck.kind === 'loading'}
              className="self-start rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600"
            >
              Check entitlement
            </button>
            <p role="status">
              {entitlementCheck.kind === 'idle' && 'Entitlement: not checked yet.'}
              {entitlementCheck.kind === 'loading' && 'Checking entitlement…'}
              {entitlementCheck.kind === 'success' && `Entitlement: ${entitlementCheck.active ? 'active' : 'inactive'}`}
              {entitlementCheck.kind === 'error' && 'Entitlement check failed.'}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
