import { useMemo } from 'react'
import { useEntitlement } from '../components/EntitlementContext'
import { isReviewContentAccessible } from '../lib/commercialAccess'
import { resolveCharacterSourceCategory, resolveWordSourceCategory } from '../lib/commercialContentSource'
import { REVIEW_SCOPE_ID, useCurriculum } from './useCurriculum'

// Commercial visibility overlays the existing curriculum result. Progress,
// weakness, SRS, and Recommended calculations remain owned by useCurriculum.
export function useCommercialCurriculum() {
  const base = useCurriculum()
  const { state } = useEntitlement()
  const pools = useMemo(() => {
    const characterAccessible = (id: string) => isReviewContentAccessible(resolveCharacterSourceCategory(id) ?? '', state.status)
    const wordAccessible = (word: { id: string }) => isReviewContentAccessible(resolveWordSourceCategory(word.id) ?? '', state.status)
    return {
      unlockedCharacterIds: base.unlockedCharacterIds.filter(characterAccessible),
      unlockedWords: base.unlockedWords.filter(wordAccessible),
      weakCharacterIds: base.weakCharacterIds.filter(characterAccessible),
      weakWords: base.weakWords.filter(wordAccessible),
    }
  }, [base.unlockedCharacterIds, base.unlockedWords, base.weakCharacterIds, base.weakWords, state.status])

  const reviewCharacterCount = pools.weakCharacterIds.length
  const reviewWordCount = pools.weakWords.length
  return {
    ...base,
    ...pools,
    reviewCharacterCount,
    reviewWordCount,
    reviewCount: reviewCharacterCount + reviewWordCount,
    getScopeWords: (scope: string | undefined) => scope === REVIEW_SCOPE_ID ? pools.weakWords : base.getScopeWords(scope),
    getScopeCharacterIds: (scope: string | undefined) => scope === REVIEW_SCOPE_ID ? pools.unlockedCharacterIds : base.getScopeCharacterIds(scope),
    getScopeQuizCharacterIds: (scope: string | undefined) => scope === REVIEW_SCOPE_ID
      ? pools.weakCharacterIds.filter(base.isQuizzableCharacterId)
      : base.getScopeQuizCharacterIds(scope),
    isScopeReady: (scope: string | undefined) => scope === REVIEW_SCOPE_ID
      ? pools.unlockedCharacterIds.length > 0 || pools.unlockedWords.length > 0
      : base.isScopeReady(scope),
  }
}
