import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { isCommerciallyAccessible, type CommercialAccessTarget } from '../lib/commercialAccess'
import { useEntitlement } from './EntitlementContext'

type CommercialAccessGateProps = {
  target: CommercialAccessTarget
  children: ReactNode
}

function GateLayout({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">{children}</div>
}

/**
 * Holds protected content behind the canonical commercial-access policy.
 * It reads entitlement only from the app context and never changes learner
 * progress or persisted data.
 */
export function CommercialAccessGate({ target, children }: CommercialAccessGateProps) {
  const { state, refresh } = useEntitlement()

  if (isCommerciallyAccessible(target, state.status)) return <>{children}</>

  if (state.status === 'loading') {
    return (
      <GateLayout>
        <p role="status">Checking access…</p>
      </GateLayout>
    )
  }

  if (state.status === 'signed-out') {
    return (
      <GateLayout>
        <h1 className="text-2xl font-bold">Sign in to unlock</h1>
        <p role="status">Sign in to access this lesson.</p>
        <Link to="/login" className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Sign in</Link>
        <Link to="/account" className="font-semibold text-blue-700 underline dark:text-blue-300">Account</Link>
      </GateLayout>
    )
  }

  if (state.status === 'unavailable') {
    return (
      <GateLayout>
        <h1 className="text-2xl font-bold">Couldn’t verify access</h1>
        <p role="status">We could not confirm access to this lesson.</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="w-full rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 dark:border-neutral-600"
        >
          Retry
        </button>
        <Link to="/account" className="font-semibold text-blue-700 underline dark:text-blue-300">Account</Link>
      </GateLayout>
    )
  }

  return (
    <GateLayout>
      <h1 className="text-2xl font-bold">{state.status === 'inactive' ? 'Full Tamamizu required' : 'Content locked'}</h1>
      <p role="status">This lesson is not available for your account.</p>
      <Link to="/account" className="w-full rounded-xl border border-neutral-400 px-5 py-3 font-semibold hover:border-blue-500 dark:border-neutral-600">Account</Link>
    </GateLayout>
  )
}
