import { useLayoutEffect } from 'react'
import { useEntitlement } from '../components/EntitlementContext'
import { CATEGORIES } from '../data/curriculum'
import { isCommerciallyAccessible } from '../lib/commercialAccess'
import { useTTS } from './useTTS'

// Cards and game sessions share singleton pronunciation playback. Stop it
// when their effective access set changes or they leave the page, even when
// the old card has already disappeared. Equivalent restricted states keep
// free playback running; callers may also use the key to expire game state.
export function useCommercialContentSession(kind: 'review-content' | 'saved-content' | undefined) {
  const { state } = useEntitlement()
  const { stop } = useTTS()
  const key = kind === undefined ? undefined : CATEGORIES
    .filter((category) => isCommerciallyAccessible({ kind, sourceCategoryId: category.id }, state.status))
    .map((category) => category.id).join(':')
  useLayoutEffect(() => {
    if (key !== undefined) return stop
  }, [key, stop])
  return key
}
