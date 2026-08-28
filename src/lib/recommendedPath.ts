import type { GojuonRow, ScriptCategory } from '../data/types'
import type { RowActivityCompletion } from '../store/progressStore'

// The Recommended Path is a separate, simpler system from Review (see
// lib/srs.ts): Review recovers weak/missed items after the fact, while
// Recommended Path just guides a first-time pass through the row's core
// activities so a learner never has to decide what to do next. Neither one
// gates the other — see PracticeHubPage/the 4 game pages' callers.
export type RecommendedActivity = 'learn' | 'kana-quiz' | 'listening' | 'word-builder' | 'done'

export type RecommendedPathInput = {
  // 'contrast-pairs' rows (促音/長音) have no Kana Quiz step — see
  // useCurriculum's isQuizzableCharacterId comment for why.
  learnStyle: 'character-set' | 'contrast-pairs'
  // "Character introduction" is complete once EITHER Learn or Tracing has
  // been finished once — neither is required over the other, and finishing
  // one never locks out the other (see PracticeHubPage's "Choose how to
  // learn" step).
  introCompleted: boolean
  kanaQuizCompleted: boolean
  listeningCompleted: boolean
  wordBuilderCompleted: boolean
}

// Pure function: given a row's current completion state, what's the ONE
// next recommended activity? 'done' means Word Builder has been completed
// too — the row's core path is finished (see PracticeHubPage's "Lesson
// complete" / Next Row treatment). Kana Typing never appears here — it's
// optional and never part of this sequence.
export function getRecommendedActivity(input: RecommendedPathInput): RecommendedActivity {
  if (!input.introCompleted) return 'learn'
  if (input.learnStyle === 'character-set' && !input.kanaQuizCompleted) return 'kana-quiz'
  if (!input.listeningCompleted) return 'listening'
  if (!input.wordBuilderCompleted) return 'word-builder'
  return 'done'
}

// Short display label for the Global Recommended Target's activity (see
// getGlobalRecommendedTarget below) — used wherever a screen needs to show
// it as text (e.g. HomePage's "Hiragana · あ〜お · Kana Quiz").
export const RECOMMENDED_ACTIVITY_LABELS: Record<Exclude<RecommendedActivity, 'done'>, string> = {
  learn: 'Learn',
  'kana-quiz': 'Kana Quiz',
  listening: 'Listening',
  'word-builder': 'Word Builder',
}

// Single-row version of the same completion check used by
// getGlobalRecommendedTarget below — reused (not reimplemented) wherever a
// screen needs "is THIS ROW's Recommended Path finished?" for a specific
// row, e.g. gating the Chōon Guide's auto-display on Sokuon practice being
// done (see CategoryRowsPage). Deliberately the exact same rule as the
// Recommended Path itself: character introduction (Learn or Tracing),
// Listening, Word Builder — no Kana Quiz for 'contrast-pairs' rows.
export function isRowRecommendedPathDone(
  row: GojuonRow,
  category: ScriptCategory,
  taughtRowIds: readonly string[],
  rowActivityCompletion: Record<string, RowActivityCompletion>,
): boolean {
  const completion = rowActivityCompletion[row.id]
  const introCompleted = taughtRowIds.includes(row.id) || completion?.tracing === true
  return (
    getRecommendedActivity({
      learnStyle: category.learnStyle,
      introCompleted,
      kanaQuizCompleted: completion?.kanaQuiz === true,
      listeningCompleted: completion?.listening === true,
      wordBuilderCompleted: completion?.wordBuilder === true,
    }) === 'done'
  )
}

export type GlobalRecommendedTarget = {
  categoryId: string
  rowId: string
  activity: Exclude<RecommendedActivity, 'done'>
}

// The ONE app-wide Recommended Target — every screen (Home, Category/Row
// selection, Practice Hub) reads this SAME value rather than computing its
// own, so skipping ahead in the curriculum never produces more than one
// "recommended" thing at once (see docs referenced from Issue #25).
//
// Walks categories in their declared order, and within each category its
// real (non-summary) rows in curriculum order (`order` field), reusing
// getRecommendedActivity per row — the first row/activity that isn't
// 'done' is the target. null once every row in every category is done.
// Deliberately does NOT consider Review/SRS/mastery — this reflects
// recommended-ROUTE progress, not proficiency.
export function getGlobalRecommendedTarget(
  rows: readonly GojuonRow[],
  categories: readonly ScriptCategory[],
  taughtRowIds: readonly string[],
  rowActivityCompletion: Record<string, RowActivityCompletion>,
): GlobalRecommendedTarget | null {
  for (const category of categories) {
    // Similar Letters (see GojuonRow.isSimilarLetters) is an optional
    // supplementary lesson, not a main-curriculum progression step — it must
    // never become the Recommended target, same as Summary.
    const categoryRows = rows
      .filter((row) => row.categoryId === category.id && !row.isSummary && !row.isSimilarLetters)
      .sort((a, b) => a.order - b.order)

    for (const row of categoryRows) {
      const completion = rowActivityCompletion[row.id]
      const introCompleted = taughtRowIds.includes(row.id) || completion?.tracing === true
      const activity = getRecommendedActivity({
        learnStyle: category.learnStyle,
        introCompleted,
        kanaQuizCompleted: completion?.kanaQuiz === true,
        listeningCompleted: completion?.listening === true,
        wordBuilderCompleted: completion?.wordBuilder === true,
      })
      if (activity !== 'done') return { categoryId: category.id, rowId: row.id, activity }
    }
  }
  return null
}
