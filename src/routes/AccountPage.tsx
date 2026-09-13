import { Link } from 'react-router-dom'
import { useEntitlement } from '../components/EntitlementContext'
import { logout } from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'

/**
 * Production account page — current signed-in user (resolved via the
 * HttpOnly session cookie, never a client-held credential), sign out,
 * and a read-only entitlement lookup. See docs/adr/0001-cross-site-
 * auth-transport.md and src/lib/auth/productionAuthClient.ts.
 *
 * The app-level EntitlementProvider re-resolves the session and entitlement
 * from the cookie on startup, focus, login, and manual refresh -- there is
 * nothing to restore from any client-side storage, by design.
 */
export default function AccountPage() {
  const apiBase = readProductionAuthApiBase()
  const { state, refresh, markSignedOut } = useEntitlement()

  async function handleLogout() {
    if (apiBase) await logout(apiBase)
    markSignedOut()
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

  if (state.status === 'unavailable' && !state.user) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">Account</h1>
        <p role="status">Account status is temporarily unavailable.</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="w-full rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 dark:border-neutral-600"
        >
          Try again
        </button>
      </div>
    )
  }

  const currentUser = state.user
  if (!currentUser) return null

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Account</h1>

      <p role="status" className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center dark:border-neutral-600 dark:bg-neutral-800">
        Signed in as <span>{currentUser.emailNormalized}</span>
      </p>

      <button
        type="button"
        onClick={() => void refresh()}
        className="w-full rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 dark:border-neutral-600"
      >
        Check entitlement
      </button>
      <p role="status">
        {state.status === 'active' && 'Entitlement: active'}
        {state.status === 'inactive' && 'Entitlement: inactive'}
        {state.status === 'unavailable' && 'Entitlement check failed.'}
      </p>

      <button
        type="button"
        onClick={() => void handleLogout()}
        className="w-full rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 dark:border-neutral-600"
      >
        Sign out
      </button>
    </div>
  )
}
