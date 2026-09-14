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
import { createSandboxCheckoutController, type SandboxCheckoutController, type SandboxCheckoutEvent } from '../lib/paddle/sandboxCheckoutController'

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
  const [hasIntent, setHasIntent] = useState(false)
  const [entitlementCheck, setEntitlementCheck] = useState<EntitlementCheckState>({ kind: 'idle' })
  const [loadingUser, setLoadingUser] = useState(true)
  const [checkoutEvent, setCheckoutEvent] = useState<SandboxCheckoutEvent | null>(null)
  const controller = useRef<SandboxCheckoutController | null>(null)
  const environment = 'error' in sandboxConfig ? 'sandbox' : sandboxConfig.environment
  const token = 'error' in sandboxConfig ? '' : sandboxConfig.token
  const priceId = 'error' in sandboxConfig ? '' : sandboxConfig.priceId
  const checkoutActive = checkoutEvent?.kind === 'preparing' || checkoutEvent?.kind === 'opening' ||
    checkoutEvent?.kind === 'open' || checkoutEvent?.kind === 'loaded'
  const checkoutReady = checkoutEvent?.kind === 'ready'
  const { error: checkoutError, status: checkoutStatus } = describeCheckout(checkoutEvent)

  useEffect(() => {
    const instance = createSandboxCheckoutController({
      config: { environment, token, priceId },
      onEvent: (event) => {
        if (event.kind === 'preparing') setHasIntent(false)
        if (event.kind === 'ready') setHasIntent(true)
        setCheckoutEvent(event)
      },
    })
    controller.current = instance
    return () => {
      instance.dispose()
      controller.current = null
    }
  }, [environment, token, priceId])

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
    await controller.current?.prepare(() => createPurchaseIntent(apiBase, environment))
  }

  async function openPhase3Checkout() {
    if ('error' in sandboxConfig) return
    await controller.current?.open()
  }

  async function handleCheckEntitlement() {
    if (!apiBase) return
    setEntitlementCheck({ kind: 'loading' })
    const result = await fetchCurrentEntitlement(apiBase)
    setEntitlementCheck(result ? { kind: 'success', active: result.active } : { kind: 'error' })
  }

  async function handleLogout() {
    if (!apiBase) return
    controller.current?.invalidate()
    setCheckoutEvent(null)
    setHasIntent(false)
    await logout(apiBase)
    setCurrentUser(null)
    setEntitlementCheck({ kind: 'idle' })
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
            {hasIntent && (
              <p className="text-sm" data-testid="purchase-intent-status">
                {checkoutReady ? 'Purchase intent ready.' : 'Purchase intent created.'} Reference values are never displayed.
              </p>
            )}
          </section>

          {hasIntent && (
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
                disabled={'error' in sandboxConfig || !checkoutReady}
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

function describeCheckout(event: SandboxCheckoutEvent | null): { error: string; status: string } {
  if (!event) return { error: '', status: '' }
  switch (event.kind) {
    case 'preparing': return { error: '', status: 'Creating purchase intent…' }
    case 'ready': return { error: '', status: 'Purchase intent ready.' }
    case 'opening': return { error: '', status: 'Loading Paddle Sandbox Checkout…' }
    case 'open': return { error: '', status: 'Checkout requested. Complete the test payment in the overlay.' }
    case 'loaded': return { error: '', status: 'Checkout loaded and correlated.' }
    case 'completed': return { error: '', status: 'Checkout completed (sandbox). Entitlement is not granted client-side — check it below once the webhook has processed.' }
    case 'closed': return { error: '', status: 'Checkout closed. Create a new purchase intent to retry.' }
    case 'unavailable': return { error: 'Could not prepare or open Paddle Sandbox Checkout. Create a new purchase intent to retry.', status: 'Checkout unavailable.' }
    case 'mismatch': return {
      error: `Checkout ${event.phase === 'completed' ? 'completion ' : ''}could not be correlated to the current purchase intent (transaction match: ${event.transactionMatches}, purchase_ref match: ${event.purchaseRefMatches}). Closed for safety — create a new purchase intent to retry.`,
      status: 'Checkout unavailable.',
    }
  }
}
