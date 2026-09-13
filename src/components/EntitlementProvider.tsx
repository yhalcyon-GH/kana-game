import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchCurrentEntitlementResult,
  fetchCurrentUserResult,
} from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'
import { EntitlementContext, type EntitlementRefreshOptions, type EntitlementRefreshResult, type EntitlementState } from './EntitlementContext'

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EntitlementState>({ status: 'loading', user: null })
  const requestSequence = useRef(0)
  const invalidateRequests = useCallback(() => { ++requestSequence.current }, [])

  const refresh = useCallback(async (options: EntitlementRefreshOptions = {}): Promise<EntitlementRefreshResult> => {
    if (options.signal?.aborted) return { kind: 'stale' }
    const requestId = ++requestSequence.current
    const isStale = () => requestId !== requestSequence.current || options.signal?.aborted
    const apply = (nextState: EntitlementState): EntitlementRefreshResult => {
      if (isStale()) return { kind: 'stale' }
      setState(nextState)
      return { kind: 'applied', state: nextState }
    }
    const unavailable = (nextState: EntitlementState): EntitlementRefreshResult => (
      options.nonDisruptive ? { kind: 'unavailable' } : apply(nextState)
    )
    const apiBase = readProductionAuthApiBase()
    if (!apiBase) {
      return apply({ status: 'signed-out', user: null })
    }

    if (!options.nonDisruptive) {
      setState((current) => ({ status: 'loading', user: current.user }))
    }
    const userResult = await fetchCurrentUserResult(apiBase)
    if (isStale()) return { kind: 'stale' }

    if (userResult.kind === 'signed-out') {
      return apply({ status: 'signed-out', user: null })
    }
    if (userResult.kind === 'unavailable') {
      return unavailable({ status: 'unavailable', user: null })
    }

    const entitlementResult = await fetchCurrentEntitlementResult(apiBase)
    if (isStale()) return { kind: 'stale' }

    if (entitlementResult.kind === 'signed-out') {
      return apply({ status: 'signed-out', user: null })
    } else if (entitlementResult.kind === 'unavailable') {
      return unavailable({ status: 'unavailable', user: userResult.user })
    } else {
      return apply({
        status: entitlementResult.entitlement.active === true ? 'active' : 'inactive',
        user: userResult.user,
      })
    }
  }, [])

  const markSignedOut = useCallback(() => {
    invalidateRequests()
    setState({ status: 'signed-out', user: null })
  }, [invalidateRequests])

  useEffect(() => {
    void refresh()
    const handleFocus = () => void refresh()
    window.addEventListener('focus', handleFocus)
    return () => {
      invalidateRequests()
      window.removeEventListener('focus', handleFocus)
    }
  }, [invalidateRequests, refresh])

  const value = useMemo(() => ({ state, refresh, markSignedOut }), [markSignedOut, refresh, state])
  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>
}
