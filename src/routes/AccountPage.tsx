import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useEntitlement } from '../components/EntitlementContext'
import { logout, signOutOtherBrowsers } from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'
import { readCheckoutPromoCode } from '../lib/paddle/promoCode'
import { useProductionSandboxPurchase } from '../hooks/useProductionSandboxPurchase'

type PurchaseStatus = ReturnType<typeof useProductionSandboxPurchase>['status']

const PROMO_CHECKOUT_TARGET = 'tamamizu-promo-checkout'

function confirmingStatus(status: PurchaseStatus): boolean {
  return status === 'processing' || status === 'still-confirming'
}

function formatCheckoutAmount(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount)
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`
  }
}

function inferPercentageOff(subtotal: number, discount: number): number | null {
  if (subtotal <= 0 || discount <= 0) return null
  const raw = (discount / subtotal) * 100
  const rounded = Math.round(raw)
  return rounded >= 1 && rounded <= 100 && Math.abs(raw - rounded) < 0.05 ? rounded : null
}

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
  const [searchParams] = useSearchParams()
  const promoCode = readCheckoutPromoCode(searchParams)
  const promoSearch = promoCode ? `?promo=${encodeURIComponent(promoCode)}` : ''
  // Manual-refresh-only confirmation: never shown on initial load (the
  // provider's own startup/focus refreshes never touch this), and always
  // replaced -- never accumulated -- by the next manual refresh's outcome.
  const [inactiveRefreshNotice, setInactiveRefreshNotice] = useState(false)
  const [logoutStatus, setLogoutStatus] = useState<'idle' | 'signing-out' | 'failed'>('idle')
  const [signOutOthersStatus, setSignOutOthersStatus] = useState<'idle' | 'working' | 'done' | 'no-persistent-session' | 'failed'>('idle')
  const [signOutOthersRevoked, setSignOutOthersRevoked] = useState(0)
  // Explicit, page-local clickwrap gate. It is intentionally unchecked by
  // default and never persisted to storage or sent as profile/analytics data.
  const [purchasePoliciesAccepted, setPurchasePoliciesAccepted] = useState(false)

  // "Full Access unlocked. Thank you!" is a ONE-TIME transition message --
  // shown only when THIS session watched confirmation (purchase.status was
  // processing/still-confirming) resolve to active, never on a cold load
  // that's already active (an already-paid returning user just sees the
  // plain "Full Access: Active" state below, with no unlock fanfare).
  const [justUnlocked, setJustUnlocked] = useState(false)
  const wasConfirmingRef = useRef(confirmingStatus(purchase.status))
  useEffect(() => {
    if (wasConfirmingRef.current && state.status === 'active') setJustUnlocked(true)
    wasConfirmingRef.current = confirmingStatus(purchase.status)
  }, [state.status, purchase.status])

  async function handleSignOutOthers() {
    if (signOutOthersStatus === 'working' || !apiBase) return
    setSignOutOthersStatus('working')
    const result = await signOutOtherBrowsers(apiBase)
    if (result.kind === 'ok') {
      setSignOutOthersRevoked(result.revoked)
      setSignOutOthersStatus('done')
      return
    }
    if (result.kind === 'signed-out') {
      markSignedOut()
      return
    }
    if (result.kind === 'no-persistent-session') {
      setSignOutOthersStatus('no-persistent-session')
      return
    }
    setSignOutOthersStatus('failed')
  }

  async function handleLogout() {
    if (logoutStatus === 'signing-out') return
    // Sensitive purchase correlation and page-local policy acceptance are
    // cleared immediately even if the server-side session revoke later fails.
    setPurchasePoliciesAccepted(false)
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
        <Link to={`/login${promoSearch}`} className="w-full rounded-xl bg-blue-600 px-5 py-3 text-center font-semibold text-white hover:bg-blue-700">
          Sign in
        </Link>
      </div>
    )
  }

  const currentUser = state.user
  const confirming = confirmingStatus(purchase.status)
  const checkoutBusy = purchase.status === 'preparing' || purchase.status === 'open'
  const buttonClass = 'w-full rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 dark:border-neutral-600'
  // Phase H2: copy is derived from the resolved config's own environment,
  // never guessed -- Sandbox must always read as a test purchase, Live
  // must read as an ordinary purchase with no "Sandbox"/"Test Mode" text.
  // purchase.environment is null only when config is invalid/absent, in
  // which case the generic (non-Sandbox-specific) copy below is used --
  // this build is never treated as Live just because it isn't Sandbox.
  const isSandbox = purchase.environment === 'sandbox'
  const purchaseButtonLabel = promoCode
    ? (isSandbox ? 'Continue with test promotion' : 'Continue with promotion')
    : (isSandbox ? 'Sandbox test purchase' : 'Buy Full Access')
  const unavailableConfigMessage = isSandbox ? 'Sandbox configuration unavailable' : 'Purchase unavailable'
  const preparingMessage = promoCode
    ? 'Checking your promotion with Paddle…'
    : (isSandbox ? 'Preparing Sandbox Checkout…' : 'Preparing checkout…')
  const openMessage = promoCode
    ? 'Your promotion is applied. Complete checkout below.'
    : (isSandbox ? 'Complete your test purchase in Paddle Checkout.' : 'Complete your purchase in Paddle Checkout.')
  const checkoutUnavailableMessage = isSandbox
    ? 'Couldn’t open Sandbox Checkout. Please try again.'
    : 'Couldn’t open checkout. Please try again.'
  const percentageOff = purchase.summary
    ? inferPercentageOff(purchase.summary.subtotal, purchase.summary.discount)
    : null

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Account</h1>

      {currentUser && (
        <p role="status" className="w-full break-words rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center dark:border-neutral-600 dark:bg-neutral-800">
          Signed in as <span>{currentUser.emailNormalized}</span>
        </p>
      )}

      {state.status === 'active' ? (
        <>
          <p role="status">Full Access: Active</p>
          {justUnlocked && <p role="status">Full Access unlocked. Thank you!</p>}
        </>
      ) : confirming ? (
        <>
          <p role="status">{purchase.status === 'processing' ? 'Processing purchase…' : 'Still confirming your purchase'}</p>
          <p role="status">
            {purchase.status === 'processing'
              ? 'Payment complete. Activating Full Access…'
              : 'Payment was completed, but Full Access is still being activated. Please try again shortly.'}
          </p>
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
          <div className="flex flex-wrap items-baseline justify-center gap-x-2">
            <h2 id="full-tamamizu" className="text-xl font-semibold">Full Access</h2>
            <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">from $5</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-2 font-semibold">
            <span>$5 USD + tax</span>
            <span aria-hidden="true">·</span>
            <span>One-time purchase</span>
            <span aria-hidden="true">·</span>
            <span>No subscription</span>
          </div>
          <p>
            Base price: USD 5.00. Applicable taxes may be included in or added to the price depending on your
            location. {promoCode ? 'Paddle will verify your promotion and calculate the final total.' : 'The final price is shown at checkout.'}
          </p>
          {promoCode && (
            <div role="status" className="flex flex-col gap-1 rounded-xl border border-emerald-500 px-4 py-3 text-left text-sm">
              <strong className="text-base">Promotion link detected</strong>
              <span>Code: <span className="font-semibold">{promoCode}</span></span>
              <span>Your discount will be checked and applied automatically. You do not need to enter a promo code in Paddle.</span>
            </div>
          )}
          {promoCode && purchase.summary && (
            <div aria-label="Promotion summary" className="flex flex-col gap-3 rounded-xl border-2 border-emerald-500 p-4 text-left">
              <div className="text-center">
                <p className="font-semibold">Promotion applied</p>
                {percentageOff !== null && <p className="text-2xl font-bold">{percentageOff}% OFF</p>}
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
                <dt>Subtotal</dt>
                <dd className="text-right font-medium">{formatCheckoutAmount(purchase.summary.subtotal, purchase.summary.currencyCode)}</dd>
                <dt>Discount</dt>
                <dd className="text-right font-medium">−{formatCheckoutAmount(purchase.summary.discount, purchase.summary.currencyCode)}</dd>
                <dt>Tax</dt>
                <dd className="text-right font-medium">{formatCheckoutAmount(purchase.summary.tax, purchase.summary.currencyCode)}</dd>
                <dt className="border-t border-neutral-300 pt-2 font-bold dark:border-neutral-700">Total</dt>
                <dd className="border-t border-neutral-300 pt-2 text-right text-lg font-bold dark:border-neutral-700">
                  {purchase.summary.total === 0 ? 'FREE' : formatCheckoutAmount(purchase.summary.total, purchase.summary.currencyCode)}
                </dd>
              </dl>
              {purchase.summary.total === 0 && (
                <p className="text-center text-sm font-semibold">No payment details are needed for this zero-total checkout.</p>
              )}
            </div>
          )}
          <div className="flex w-full items-start gap-3 rounded-xl border border-neutral-300 p-4 text-left dark:border-neutral-700">
            <input
              id="purchase-policy-acceptance"
              type="checkbox"
              checked={purchasePoliciesAccepted}
              disabled={!purchase.configured || checkoutBusy}
              onChange={(event) => setPurchasePoliciesAccepted(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0"
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="purchase-policy-acceptance" className="font-semibold text-neutral-900 dark:text-neutral-100">
                I agree to Tamamizu&apos;s Terms &amp; Conditions and Refund Policy.
              </label>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Read the <Link to="/terms" className="underline">Terms &amp; Conditions</Link> and{' '}
                <Link to="/refund" className="underline">Refund Policy</Link> before purchasing.
              </p>
            </div>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            You can also review the <Link to="/privacy" className="underline">Privacy Policy</Link> and{' '}
            <Link to="/support" className="underline">Support &amp; Contact</Link>.
          </p>
          <button
            type="button"
            disabled={!purchase.configured || checkoutBusy || !purchasePoliciesAccepted}
            onClick={() => void purchase.start(promoCode, promoCode ? PROMO_CHECKOUT_TARGET : undefined)}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {purchaseButtonLabel}
          </button>
          {!purchase.configured && <p role="status">{unavailableConfigMessage}</p>}
          {purchase.status === 'preparing' && <p role="status">{preparingMessage}</p>}
          {purchase.status === 'open' && <p role="status">{openMessage}</p>}
          {purchase.status === 'unavailable' && <p role="status">{checkoutUnavailableMessage}</p>}
          {purchase.status === 'promotion-unavailable' && (
            <p role="alert" className="rounded-xl border border-amber-500 p-4 text-sm">
              This promotion could not be applied. Please try the link again or contact Support before purchasing.
            </p>
          )}
          {promoCode && (
            <div
              aria-label="Secure Paddle checkout"
              className={`${PROMO_CHECKOUT_TARGET} ${checkoutBusy ? 'w-full overflow-hidden rounded-xl' : 'hidden'}`}
            />
          )}
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

      {currentUser && (
        <section aria-labelledby="signed-in-devices" className="flex w-full flex-col gap-3 border-t border-neutral-300 pt-5 text-center dark:border-neutral-700">
          <h2 id="signed-in-devices" className="text-lg font-semibold">Signed-in browsers &amp; devices</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            You can stay signed in on up to 3 browsers or devices. Signing in on another one automatically signs out
            the least recently used one.
          </p>
          <button
            type="button"
            disabled={signOutOthersStatus === 'working'}
            onClick={() => void handleSignOutOthers()}
            className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {signOutOthersStatus === 'working' ? 'Signing out other browsers…' : 'Sign out other browsers'}
          </button>
          {signOutOthersStatus === 'done' && (
            <p role="status">
              {signOutOthersRevoked > 0
                ? `Signed out ${signOutOthersRevoked} other browser${signOutOthersRevoked === 1 ? '' : 's'}.`
                : 'No other browsers were signed in.'}
            </p>
          )}
          {signOutOthersStatus === 'no-persistent-session' && (
            <p role="status">This browser isn’t currently one of your remembered browsers.</p>
          )}
          {signOutOthersStatus === 'failed' && (
            <p role="alert" className="rounded-xl border border-amber-500 p-4 text-center">
              Couldn’t sign out other browsers. Please try again.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
