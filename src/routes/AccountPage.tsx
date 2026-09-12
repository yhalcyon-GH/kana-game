import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchCurrentEntitlement,
  fetchCurrentUser,
  logout,
  type CurrentUser,
} from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'

type EntitlementCheckState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; active: boolean }
  | { kind: 'error' }

/**
 * Production account page — current signed-in user (resolved via the
 * HttpOnly session cookie, never a client-held credential), sign out,
 * and a read-only entitlement lookup. See docs/adr/0001-cross-site-
 * auth-transport.md and src/lib/auth/productionAuthClient.ts.
 *
 * Reloading this page re-resolves the session from the cookie alone
 * (fetchCurrentUser() with credentials: 'include') -- there is nothing
 * to restore from any client-side storage, by design.
 */
export default function AccountPage() {
  const apiBase = readProductionAuthApiBase()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)
  const [entitlementCheck, setEntitlementCheck] = useState<EntitlementCheckState>({ kind: 'idle' })

  const refreshCurrentUser = useCallback(async () => {
    setLoadingUser(true)
    const user = await fetchCurrentUser(apiBase)
    setCurrentUser(user)
    setLoadingUser(false)
  }, [apiBase])

  useEffect(() => {
    void refreshCurrentUser()
  }, [refreshCurrentUser])

  async function handleCheckEntitlement() {
    setEntitlementCheck({ kind: 'loading' })
    const result = await fetchCurrentEntitlement(apiBase)
    setEntitlementCheck(result ? { kind: 'success', active: result.active } : { kind: 'error' })
  }

  async function handleLogout() {
    await logout(apiBase)
    setCurrentUser(null)
    setEntitlementCheck({ kind: 'idle' })
  }

  if (loadingUser) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">Account</h1>
        <p role="status">Checking your session…</p>
      </div>
    )
  }

  if (!currentUser) {
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

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Account</h1>

      <p role="status" className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center dark:border-neutral-600 dark:bg-neutral-800">
        Signed in as <span>{currentUser.emailNormalized}</span>
      </p>

      <button
        type="button"
        onClick={() => void handleCheckEntitlement()}
        disabled={entitlementCheck.kind === 'loading'}
        className="w-full rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600"
      >
        Check entitlement
      </button>
      <p role="status">
        {entitlementCheck.kind === 'idle' && 'Entitlement: not checked yet.'}
        {entitlementCheck.kind === 'loading' && 'Checking entitlement…'}
        {entitlementCheck.kind === 'success' && `Entitlement: ${entitlementCheck.active ? 'active' : 'inactive'}`}
        {entitlementCheck.kind === 'error' && 'Entitlement check failed.'}
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
