import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchCurrentEntitlementResult,
  fetchCurrentUserResult,
} from '../lib/auth/productionAuthClient'
import { readProductionAuthApiBase } from '../lib/auth/productionAuthApiBase'
import { EntitlementContext, type EntitlementState } from './EntitlementContext'

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EntitlementState>({ status: 'loading', user: null })
  const requestSequence = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestSequence.current
    setState((current) => ({ status: 'loading', user: current.user }))

    const apiBase = readProductionAuthApiBase()
    const userResult = await fetchCurrentUserResult(apiBase)
    if (requestId !== requestSequence.current) return

    if (userResult.kind === 'signed-out') {
      setState({ status: 'signed-out', user: null })
      return
    }
    if (userResult.kind === 'unavailable') {
      setState({ status: 'unavailable', user: null })
      return
    }

    const entitlementResult = await fetchCurrentEntitlementResult(apiBase)
    if (requestId !== requestSequence.current) return

    if (entitlementResult.kind === 'signed-out') {
      setState({ status: 'signed-out', user: null })
    } else if (entitlementResult.kind === 'unavailable') {
      setState({ status: 'unavailable', user: userResult.user })
    } else {
      setState({
        status: entitlementResult.entitlement.active ? 'active' : 'inactive',
        user: userResult.user,
      })
    }
  }, [])

  const markSignedOut = useCallback(() => {
    ++requestSequence.current
    setState({ status: 'signed-out', user: null })
  }, [])

  useEffect(() => {
    void refresh()
    const handleFocus = () => void refresh()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refresh])

  const value = useMemo(() => ({ state, refresh, markSignedOut }), [markSignedOut, refresh, state])
  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>
}
