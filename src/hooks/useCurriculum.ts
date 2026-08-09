import { useMemo } from 'react'
import { getCumulativeCharacterIds, ROWS, ROWS_BY_ID } from '../data/curriculum'
import type { AnchorWord } from '../data/types'
import { WORDS_BY_ROW } from '../data/words'
import { isDue } from '../lib/srs'
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
  const characters = useProgressStore((s) => s.characters)

  const unlockedCharacterIds = useMemo(
    () => ROWS.filter((r) => taughtRowIds.includes(r.id)).flatMap((r) => r.characterIds),
    [taughtRowIds],
  )

  const unlockedWords = useMemo<AnchorWord[]>(
    () => taughtRowIds.flatMap((id) => WORDS_BY_ROW[id] ?? []),
    [taughtRowIds],
  )

  // Characters "due" for review right now (see lib/srs.ts isDue): drives
  // both the Review scope's word selection below and the due-count badge
  // shown near the Review entry points.
  const dueCharacterIds = useMemo(
    () => unlockedCharacterIds.filter((id) => isDue(characters[id] ?? { box: 0, lastSeen: 0 })),
    [unlockedCharacterIds, characters],
  )

  const isRowTaught = (rowId: string) => taughtRowIds.includes(rowId)

  // Word pool for a given practice scope: a real row's own word list, or —
  // for the review scope — every taught word that touches a due character,
  // so review sessions surface what actually needs practice instead of
  // mixing everything uniformly. Falls back to the full taught pool if
  // nothing happens to be due yet, so Review is never empty.
  const getScopeWords = (rowId: string | undefined): AnchorWord[] => {
    if (!rowId) return []
    if (rowId === REVIEW_SCOPE_ID) {
      const due = unlockedWords.filter((w) => w.characterIds.some((c) => dueCharacterIds.includes(c)))
      return due.length > 0 ? due : unlockedWords
    }
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

  // Character pool that's actually being TESTED (as opposed to
  // getScopeCharacterIds above, which also supplies distractors and so is
  // deliberately cumulative): for a real row, just that row's own new
  // characters — mirrors getScopeWords using WORDS_BY_ROW rather than the
  // cumulative pool. For the review scope, due characters take priority
  // (same fallback as getScopeWords: everything taught, if nothing's due).
  const getScopeQuizCharacterIds = (rowId: string | undefined): string[] => {
    if (!rowId) return []
    if (rowId === REVIEW_SCOPE_ID) return dueCharacterIds.length > 0 ? dueCharacterIds : unlockedCharacterIds
    return ROWS_BY_ID[rowId]?.characterIds ?? []
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
    dueReviewCount: dueCharacterIds.length,
    // Rows are never gated — the learner can freely jump to any row,
    // regardless of SRS-based unlock progress (which is still tracked in
    // unlockedRowIds for informational purposes elsewhere).
    isRowUnlocked: () => true,
    isRowTaught,
    getScopeWords,
    getScopeCharacterIds,
    getScopeQuizCharacterIds,
    isScopeReady,
  }
}
