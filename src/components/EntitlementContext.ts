import { createContext, useContext } from 'react'
import type { CurrentUser } from '../lib/auth/productionAuthClient'

export type EntitlementState =
  | { status: 'loading'; user: CurrentUser | null }
  | { status: 'signed-out'; user: null }
  | { status: 'inactive'; user: CurrentUser }
  | { status: 'active'; user: CurrentUser }
  | { status: 'unavailable'; user: CurrentUser | null }

export type EntitlementRefreshResult =
  | { kind: 'applied'; state: EntitlementState }
  | { kind: 'stale' }

export type EntitlementRefreshOptions = {
  /** Preserve the current presentation while purchase confirmation is in flight. */
  nonDisruptive?: boolean
  /** An invalidated Account attempt must never apply its pending verification. */
  signal?: AbortSignal
}

export type EntitlementContextValue = {
  state: EntitlementState
  refresh: (options?: EntitlementRefreshOptions) => Promise<EntitlementRefreshResult>
  markSignedOut: () => void
}

const defaultValue: EntitlementContextValue = {
  state: { status: 'loading', user: null },
  refresh: async () => ({ kind: 'stale' }),
  markSignedOut: () => {},
}

export const EntitlementContext = createContext<EntitlementContextValue>(defaultValue)

export function useEntitlement(): EntitlementContextValue {
  return useContext(EntitlementContext)
}
