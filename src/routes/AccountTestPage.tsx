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
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [checkoutStatus, setCheckoutStatus] = useState('')
  const mountedCheckout = useRef(false)
  const openingCheckout = useRef(false)
  const checkoutInstance = useRef<Paddle | undefined>(undefined)

  useEffect(() => {
    mountedCheckout.current = true
    return () => {
      mountedCheckout.current = false
      checkoutInstance.current?.Checkout.close()
    }
  }, [])

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
    if (!apiBase) return
    setPurchaseRef(null)
    setCheckoutError('')
    setCheckoutStatus('')
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
    if (!purchaseRef || 'error' in sandboxConfig || openingCheckout.current) return
    openingCheckout.current = true
    setCheckoutLoading(true)
    setCheckoutError('')
    setCheckoutStatus('Loading Paddle Sandbox Checkout…')

    try {
      const paddle = await initializePaddle({
        environment: 'sandbox',
        token: sandboxConfig.token,
        eventCallback: handleCheckoutEvent,
      })
      if (!mountedCheckout.current) return
      if (!paddle?.Initialized) throw new Error('Paddle did not initialize')
      checkoutInstance.current = paddle
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
    } finally {
      openingCheckout.current = false
      if (mountedCheckout.current) setCheckoutLoading(false)
    }
  }

  function handleCheckoutEvent(event: PaddleEventData) {
    if (!mountedCheckout.current || !event.name) return
    const name = event.name
    if (name === 'checkout.completed') {
      // Client events are diagnostic only and MUST NOT grant entitlement
      // -- see "3. Entitlement" below, which always reads
      // entitlement-me.php's server-verified state instead.
      setCheckoutStatus('Checkout completed (sandbox). Entitlement is not granted client-side — check it below once the webhook has processed.')
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
              className="self-start rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
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
                disabled={'error' in sandboxConfig || checkoutLoading}
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
