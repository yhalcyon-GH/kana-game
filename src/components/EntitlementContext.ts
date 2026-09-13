import { createContext, useContext } from 'react'
import type { CurrentUser } from '../lib/auth/productionAuthClient'

export type EntitlementState =
  | { status: 'loading'; user: CurrentUser | null }
  | { status: 'signed-out'; user: null }
  | { status: 'inactive'; user: CurrentUser }
  | { status: 'active'; user: CurrentUser }
  | { status: 'unavailable'; user: CurrentUser | null }

export type EntitlementContextValue = {
  state: EntitlementState
  refresh: () => Promise<void>
  markSignedOut: () => void
}

const defaultValue: EntitlementContextValue = {
  state: { status: 'loading', user: null },
  refresh: async () => {},
  markSignedOut: () => {},
}

export const EntitlementContext = createContext<EntitlementContextValue>(defaultValue)

export function useEntitlement(): EntitlementContextValue {
  return useContext(EntitlementContext)
}
