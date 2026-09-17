import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEntitlement } from '../components/EntitlementContext'
import { logout } from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'
import { useProductionSandboxPurchase } from '../hooks/useProductionSandboxPurchase'

/**
 * Production account page — current signed-in user (resolved via the
 * HttpOnly session cookie, never a client-held credential), sign out,
 * and purchase confirmation (Sandbox test purchase or Live purchase,
 * depending on this build's configured Paddle environment -- see
 * docs/paddle-environment-separation.md). See docs/adr/0001-cross-site-
 * auth-transport.md and src/lib/auth/productionAuthClient.ts.
 *
 * The app-level EntitlementProvider re-resolves the session and entitlement
 * from the cookie on startup, focus, login, and manual refresh -- there is
 * nothing to restore from any client-side storage, by design.
 */
export default function AccountPage() {
  const apiBase = readProductionAuthApiBase()
  const { state, refresh, markSignedOut } = useEntitlement()
  const purchase = useProductionSandboxPurchase()
  // Manual-refresh-only confirmation: never shown on initial load (the
  // provider's own startup/focus refreshes never touch this), and always
  // replaced -- never accumulated -- by the next manual refresh's outcome.
  const [inactiveRefreshNotice, setInactiveRefreshNotice] = useState(false)
  const [logoutStatus, setLogoutStatus] = useState<'idle' | 'signing-out' | 'failed'>('idle')

  async function handleLogout() {
    if (logoutStatus === 'signing-out') return
    // Sensitive purchase correlation is local/in-memory and should be cleared
    // immediately even if the server-side session revoke later fails.
    purchase.invalidate()
    setLogoutStatus('signing-out')
    if (!apiBase) {
      setLogoutStatus('failed')
      return
    }
    const result = await logout(apiBase)
    if (result.kind === 'signed-out') {
      markSignedOut()
      setLogoutStatus('idle')
      return
    }
    // Keep the server-backed authenticated presentation on an unconfirmed
    // revoke. The HttpOnly cookie is not writable by this JavaScript, so
    // pretending to sign out here would leave the real session live.
    setLogoutStatus('failed')
  }

  async function handleCheckEntitlement() {
    setInactiveRefreshNotice(false)
    const result = await refresh()
    setInactiveRefreshNotice(result.kind === 'applied' && result.state.status === 'inactive')
  }

  if (state.status === 'loading') {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">Account</h1>
        <p role="status">Checking your session…</p>
      </div>
    )
  }

  if (state.status === 'signed-out') {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">Account</h1>
        <p role="status">Not signed in.</p>
        <Link to="/login" className="w-full rounded-xl bg-blue-600 px-5 py-3 text-center font-semibold text-white hover:bg-blue-700">
          Sign in
        </Link>
      </div>
    )
  }

  const currentUser = state.user
  const confirming = purchase.status === 'processing' || purchase.status === 'still-confirming'
  const checkoutBusy = purchase.status === 'preparing' || purchase.status === 'open'
  const buttonClass = 'w-full rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 dark:border-neutral-600'
  // Phase H2: copy is derived from the resolved config's own environment,
  // never guessed -- Sandbox must always read as a test purchase, Live
  // must read as an ordinary purchase with no "Sandbox"/"Test Mode" text.
  // purchase.environment is null only when config is invalid/absent, in
  // which case the generic (non-Sandbox-specific) copy below is used --
  // this build is never treated as Live just because it isn't Sandbox.
  const isSandbox = purchase.environment === 'sandbox'
  const purchaseButtonLabel = isSandbox ? 'Sandbox test purchase' : 'Buy Full Access'
  const unavailableConfigMessage = isSandbox ? 'Sandbox configuration unavailable' : 'Purchase unavailable'
  const preparingMessage = isSandbox ? 'Preparing Sandbox Checkout…' : 'Preparing checkout…'
  const openMessage = isSandbox ? 'Complete your test purchase in Paddle Checkout.' : 'Complete your purchase in Paddle Checkout.'
  const checkoutUnavailableMessage = isSandbox
    ? 'Couldn’t open Sandbox Checkout. Please try again.'
    : 'Couldn’t open checkout. Please try again.'

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Account</h1>

      {currentUser && (
        <p role="status" className="w-full break-words rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center dark:border-neutral-600 dark:bg-neutral-800">
          Signed in as <span>{currentUser.emailNormalized}</span>
        </p>
      )}

      {state.status === 'active' ? (
        <p role="status">Full Access: Active</p>
      ) : confirming ? (
        <>
          <p role="status">{purchase.status === 'processing' ? 'Processing purchase…' : 'Still confirming your purchase'}</p>
          {purchase.status === 'still-confirming' && (
            <button type="button" onClick={purchase.retry} className={buttonClass}>Retry</button>
          )}
          <button type="button" onClick={purchase.cancel} className={buttonClass}>Cancel confirmation</button>
        </>
      ) : state.status === 'unavailable' ? (
        <>
          <p role="status">Couldn’t verify access</p>
          <button type="button" onClick={() => void refresh()} className={buttonClass}>Retry</button>
        </>
      ) : (
        <section aria-labelledby="full-tamamizu" className="flex w-full flex-col gap-4 text-center">
          <h2 id="full-tamamizu" className="text-xl font-semibold">Full Access</h2>
          <p>
            Base price: USD 5.00. Applicable taxes may be included in or added to the price depending on your
            location. The final price is shown at checkout.
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            By continuing, review the <Link to="/terms" className="underline">Terms &amp; Conditions</Link>,{' '}
            <Link to="/refund" className="underline">Refund Policy</Link>, <Link to="/privacy" className="underline">Privacy Policy</Link>, and{' '}
            <Link to="/support" className="underline">Support &amp; Contact</Link>.
          </p>
          <button
            type="button"
            disabled={!purchase.configured || checkoutBusy}
            onClick={() => void purchase.start()}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {purchaseButtonLabel}
          </button>
          {!purchase.configured && <p role="status">{unavailableConfigMessage}</p>}
          {purchase.status === 'preparing' && <p role="status">{preparingMessage}</p>}
          {purchase.status === 'open' && <p role="status">{openMessage}</p>}
          {purchase.status === 'unavailable' && <p role="status">{checkoutUnavailableMessage}</p>}
          {checkoutBusy && <button type="button" onClick={purchase.cancel} className={buttonClass}>Cancel checkout</button>}
        </section>
      )}

      {!confirming && !checkoutBusy && state.status !== 'unavailable' && (
        <>
          <button type="button" onClick={() => void handleCheckEntitlement()} className={buttonClass}>Check entitlement</button>
          {inactiveRefreshNotice && (
            <p role="status">Access checked — Full Access is not active yet.</p>
          )}
        </>
      )}
      {(currentUser || confirming) && (
        <button
          type="button"
          disabled={logoutStatus === 'signing-out'}
          onClick={() => void handleLogout()}
          className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {logoutStatus === 'signing-out' ? 'Signing out…' : 'Sign out'}
        </button>
      )}
      {logoutStatus === 'failed' && (
        <p role="alert" className="rounded-xl border border-amber-500 p-4 text-center">
          Couldn’t sign out. Please try again.
        </p>
      )}
    </div>
  )
}
