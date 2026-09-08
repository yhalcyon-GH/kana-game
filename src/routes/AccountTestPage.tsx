import { useCallback, useEffect, useState } from 'react'
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

  const [email, setEmail] = useState('')
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null)
  const [linkRetrieval, setLinkRetrieval] = useState<LinkRetrievalState>({ kind: 'idle' })
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [purchaseRef, setPurchaseRef] = useState<string | null>(null)
  const [entitlementCheck, setEntitlementCheck] = useState<EntitlementCheckState>({ kind: 'idle' })
  const [loadingUser, setLoadingUser] = useState(true)

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

  async function handleRequestLink() {
    if (!apiBase || !email) return
    setRequestedEmail(email)
    setLinkRetrieval({ kind: 'idle' })
    await requestMagicLink(apiBase, email)
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
    const ref = await createPurchaseIntent(apiBase)
    setPurchaseRef(ref)
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
            disabled={!email}
            className="self-start rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Request test Magic Link
          </button>

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
                Pass this single value as Paddle customData on the existing Sandbox Checkout (<code>/paddle-test</code>) —
                this is the only identifier the browser is allowed to send Paddle for the real-user path.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3 border-t border-neutral-300 pt-5 dark:border-neutral-700">
            <h2 className="text-lg font-semibold">3. Entitlement (server-verified only)</h2>
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
