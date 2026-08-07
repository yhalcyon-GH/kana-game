import { useMemo } from 'react'
import { getCumulativeCharacterIds, ROWS, ROWS_BY_ID } from '../data/curriculum'
import type { AnchorWord } from '../data/types'
import { WORDS_BY_ROW } from '../data/words'
import { useProgressStore } from '../store/progressStore'

// Pseudo row id used by the Review pages/routes (/practice/review/*) to
// mean "mix every taught row" instead of one specific row — it reuses the
// same PracticeHubPage/game components and route shape as a real row so
// there's no parallel set of components to maintain.
export const REVIEW_SCOPE_ID = 'review'

// Combines the static curriculum/word data with live progress state to
// answer "what is currently usable" — every game and Teach screen should
// go through this hook rather than touching data/ or the store directly,
// so the "practice only uses taught vocabulary" invariant lives in one place.
export function useCurriculum() {
  const unlockedRowIds = useProgressStore((s) => s.unlockedRowIds)
  const taughtRowIds = useProgressStore((s) => s.taughtRowIds)

  const unlockedCharacterIds = useMemo(
    () => ROWS.filter((r) => taughtRowIds.includes(r.id)).flatMap((r) => r.characterIds),
    [taughtRowIds],
  )

  const unlockedWords = useMemo<AnchorWord[]>(
    () => taughtRowIds.flatMap((id) => WORDS_BY_ROW[id] ?? []),
    [taughtRowIds],
  )

  const isRowTaught = (rowId: string) => taughtRowIds.includes(rowId)

  // Word pool for a given practice scope: a real row's own word list, or
  // every taught word for the review scope.
  const getScopeWords = (rowId: string | undefined): AnchorWord[] => {
    if (!rowId) return []
    if (rowId === REVIEW_SCOPE_ID) return unlockedWords
    return WORDS_BY_ROW[rowId] ?? []
  }

  // Character pool for a given practice scope's distractor tiles: for a
  // real row this is every character introduced at or before it (so
  // Practice works even if the learner jumps in before doing Learn), or
  // every taught character for the review scope.
  const getScopeCharacterIds = (rowId: string | undefined): string[] => {
    if (!rowId) return []
    if (rowId === REVIEW_SCOPE_ID) return unlockedCharacterIds
    return getCumulativeCharacterIds(rowId)
  }

  // Learn and Practice are both always available for any real row — taught
  // status only drives the "learn"/"practice" badge on the home screen, not
  // access. The review scope is the one exception: it needs at least one
  // taught row to have anything to mix together.
  const isScopeReady = (rowId: string | undefined): boolean => {
    if (!rowId) return false
    if (rowId === REVIEW_SCOPE_ID) return taughtRowIds.length > 0
    return !!ROWS_BY_ID[rowId]
  }

  return {
    rows: ROWS,
    unlockedRowIds,
    taughtRowIds,
    unlockedCharacterIds,
    unlockedWords,
    // Rows are never gated — the learner can freely jump to any row,
    // regardless of SRS-based unlock progress (which is still tracked in
    // unlockedRowIds for informational purposes elsewhere).
    isRowUnlocked: () => true,
    isRowTaught,
    getScopeWords,
    getScopeCharacterIds,
    isScopeReady,
  }
}
