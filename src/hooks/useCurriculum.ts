import { useMemo } from 'react'
import { CHARACTERS_BY_ID } from '../data/characters'
import { CATEGORIES_BY_ID, getCumulativeCharacterIds, ROWS, ROWS_BY_ID, SUMMARY_ROW_SOURCE_CATEGORY_IDS } from '../data/curriculum'
import type { AnchorWord } from '../data/types'
import { WORDS_BY_ROW } from '../data/words'
import { isDue, isWeak } from '../lib/srs'
import { useProgressStore } from '../store/progressStore'
import { GAME_SESSION_ROUNDS } from './useGameSession'

// Fixed practice-session size for a summary row (see GojuonRow.isSummary) —
// deliberately not the normal weighted GAME_SESSION_ROUNDS sizing, since
// the whole point is "a fixed-length quiz over everything in the
// category," not a due-based review.
export const SUMMARY_SESSION_ROUNDS = 15

function isSummaryRow(rowId: string | undefined): boolean {
  return !!rowId && !!ROWS_BY_ID[rowId]?.isSummary
}

// A summary row's own characterIds already hold the full aggregated
// character list (built once in curriculum.ts) — but its WORDS aren't
// stored per-row in words.ts (that would mean duplicating every word
// entry), so they're assembled here from every real row in the categories
// SUMMARY_ROW_SOURCE_CATEGORY_IDS lists for it.
function getSummaryWords(rowId: string): AnchorWord[] {
  const categoryIds = SUMMARY_ROW_SOURCE_CATEGORY_IDS[rowId] ?? []
  return ROWS.filter((r) => !r.isSummary && categoryIds.includes(r.categoryId)).flatMap((r) => WORDS_BY_ROW[r.id] ?? [])
}

// Kana Quiz's "see an isolated character, pick its reading" premise doesn't
// fit a 'contrast-pairs' category (促音/長音) — there's no single correct
// romaji for っ/ー in isolation (see characters.ts's sokuon comment). A
// real row hides the Kana Quiz card entirely for these (PracticeHubPage)
// and blocks direct navigation to it (KanaQuizPage), but the Review scope
// mixes every taught row together regardless of category, so it needs its
// own filter to keep contrast-pairs characters out of ITS Kana Quiz pool
// without excluding them from other games (they're still fine as Word
// Builder distractor tiles, for instance).
function isQuizzableCharacterId(id: string): boolean {
  const rowId = CHARACTERS_BY_ID[id]?.rowId
  const categoryId = rowId ? ROWS_BY_ID[rowId]?.categoryId : undefined
  return CATEGORIES_BY_ID[categoryId ?? '']?.learnStyle !== 'contrast-pairs'
}

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

  // Mistake-prone characters/words for Review's "weak items" browse lists
  // (ReviewMistakesPage) — unlike dueCharacterIds above, this isn't about
  // review timing, it's specifically "have actually gotten this wrong
  // recently" (see lib/srs.ts's isWeak). A word counts as weak if ANY of
  // its characters is weak, same inclusion rule getScopeWords uses for due
  // characters — there's no separate per-word progress to check directly
  // (progressStore only tracks characters).
  const weakCharacterIds = useMemo(
    () => unlockedCharacterIds.filter((id) => isWeak(characters[id] ?? { box: 0, totalSeen: 0 })),
    [unlockedCharacterIds, characters],
  )
  const weakWords = useMemo(
    () => unlockedWords.filter((w) => w.characterIds.some((c) => weakCharacterIds.includes(c))),
    [unlockedWords, weakCharacterIds],
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
    if (isSummaryRow(rowId)) return getSummaryWords(rowId)
    return WORDS_BY_ROW[rowId] ?? []
  }

  // Character pool for a given practice scope's distractor tiles: for a
  // real row this is every character introduced at or before it (so
  // Practice works even if the learner jumps in before doing Learn), or
  // every taught character for the review scope.
  const getScopeCharacterIds = (rowId: string | undefined): string[] => {
    if (!rowId) return []
    if (rowId === REVIEW_SCOPE_ID) return unlockedCharacterIds
    // Deduped: a summary row's own characterIds already list its whole
    // category, so getCumulativeCharacterIds's order<=own-order aggregation
    // includes that full list a second time via the summary row itself —
    // without deduping, a distractor pool could contain the same character
    // id twice, letting pickDistractorCharIds surface it as two identical
    // wrong-answer choices in one round.
    return [...new Set(getCumulativeCharacterIds(rowId))]
  }

  // Character pool that's actually being TESTED (as opposed to
  // getScopeCharacterIds above, which also supplies distractors and so is
  // deliberately cumulative): for a real row, just that row's own new
  // characters — mirrors getScopeWords using WORDS_BY_ROW rather than the
  // cumulative pool. For the review scope, due characters take priority
  // (same fallback as getScopeWords: everything taught, if nothing's due).
  const getScopeQuizCharacterIds = (rowId: string | undefined): string[] => {
    if (!rowId) return []
    if (rowId === REVIEW_SCOPE_ID) {
      const due = dueCharacterIds.filter(isQuizzableCharacterId)
      if (due.length > 0) return due
      return unlockedCharacterIds.filter(isQuizzableCharacterId)
    }
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

  // Fixed 15-question sessions for a summary row (see GojuonRow.isSummary);
  // every other scope keeps the normal weighted GAME_SESSION_ROUNDS sizing.
  const getScopeRounds = (rowId: string | undefined): number => (isSummaryRow(rowId) ? SUMMARY_SESSION_ROUNDS : GAME_SESSION_ROUNDS)

  return {
    rows: ROWS,
    unlockedRowIds,
    taughtRowIds,
    unlockedCharacterIds,
    unlockedWords,
    weakCharacterIds,
    weakWords,
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
    getScopeRounds,
    isSummaryRow,
  }
}
