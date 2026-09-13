import { useMemo } from 'react'
import { useEntitlement } from '../components/EntitlementContext'
import { isSavedContentAccessible } from '../lib/commercialAccess'
import { resolveCharacterSourceCategory, resolveWordSourceCategory } from '../lib/commercialContentSource'
import { useSavedItemsStore } from '../store/savedItemsStore'

// Cards and navigation badges share the same access-filtered IDs; the saved
// store retains every original ID, including currently unresolved content.
export function useCommercialSavedItems() {
  const { state } = useEntitlement()
  const characterIds = useSavedItemsStore((s) => s.savedCharacterIds)
  const wordIds = useSavedItemsStore((s) => s.savedWordIds)
  return useMemo(() => {
    const savedCharacterIds = characterIds.filter((id) => isSavedContentAccessible(resolveCharacterSourceCategory(id) ?? '', state.status))
    const savedWordIds = wordIds.filter((id) => isSavedContentAccessible(resolveWordSourceCategory(id) ?? '', state.status))
    return { savedCharacterIds, savedWordIds, savedCount: savedCharacterIds.length + savedWordIds.length }
  }, [characterIds, wordIds, state.status])
}
