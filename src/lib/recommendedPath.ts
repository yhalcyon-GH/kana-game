import { PRACTICE_CHECKPOINTS } from '../data/practiceCheckpoints'
import type { GojuonRow, ScriptCategory } from '../data/types'
import type { PracticeMode } from '../data/restaurantDishes'
import type { AssessmentScript } from './assessment/types'
import type { RowActivityCompletion } from '../store/progressStore'

// The Recommended Path is a separate, simpler system from Review (see
// lib/srs.ts): Review recovers weak/missed items after the fact, while
// Recommended Path just guides a first-time pass through the row's core
// activities so a learner never has to decide what to do next. Neither one
// gates the other — see PracticeHubPage/the 4 game pages' callers.
//
// Restaurant/Cafe checkpoints are now explicit Recommended steps after Word
// Builder (Issue #183), but remain score-independent and isolated from
// Review/SRS/mastery. Their only persisted signal is the row's `checkpoint`
// completion flag in RowActivityCompletion.
//
// 'hiragana-test'/'katakana-test' (Issue #189) are the same kind of
// score-independent endpoint step, placed after a whole SCRIPT's rows are
// done rather than after one row — see ASSESSMENT_STEPS/
// getGlobalRecommendedTarget below. Their only persisted signal is
// progressStore's assessmentCompletion; finishing all 20 questions
// completes the step regardless of score.
export type RecommendedActivity = 'learn' | 'kana-quiz' | 'listening' | 'word-builder' | PracticeMode | 'hiragana-test' | 'katakana-test' | 'done'

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
  // Optional real-life checkpoint placed after this row. Rows without one
  // behave exactly as before. Completion means only that the learner reached
  // the end of the 8-question Restaurant/Cafe session; score never gates it.
  checkpointMode?: PracticeMode
  checkpointCompleted?: boolean
}

// Pure function: given a row's current completion state, what's the ONE
// next recommended activity? 'done' means Word Builder — and, where one is
// configured, the row's Restaurant/Cafe checkpoint — has been completed.
// Kana Typing never appears here — it's optional and never part of this
// sequence.
export function getRecommendedActivity(input: RecommendedPathInput): RecommendedActivity {
  if (!input.introCompleted) return 'learn'
  if (input.learnStyle === 'character-set' && !input.kanaQuizCompleted) return 'kana-quiz'
  if (!input.listeningCompleted) return 'listening'
  if (!input.wordBuilderCompleted) return 'word-builder'
  if (input.checkpointMode && !input.checkpointCompleted) return input.checkpointMode
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
  restaurant: 'Restaurant Practice',
  cafe: 'Cafe Practice',
  'hiragana-test': 'Hiragana Test',
  'katakana-test': 'Katakana Test',
}

function checkpointAfterRow(rowId: string) {
  return PRACTICE_CHECKPOINTS.find((checkpoint) => checkpoint.afterRowId === rowId)
}

// The approved Hiragana/Katakana Test placement (Issue #189): each test is a
// single endpoint step inserted once every REAL row of its own category is
// 'done' (including any trailing Restaurant/Cafe checkpoint on that
// category's last row), before the walk below moves on to the next
// category. A flat config list, same pattern as PRACTICE_CHECKPOINTS above,
// rather than hardcoding 'hiragana'/'katakana' checks inline — a plain
// afterCategoryId lookup, not inferred from CATEGORIES array order. `rowId`
// here is a sentinel, never a real GojuonRow id (ROWS_BY_ID has no entry for
// it) — existing callers that look up `ROWS_BY_ID[globalRecommendedTarget.rowId]`
// already treat a missing row as "nothing more specific to show" (see
// HomePage), so this is a safe, non-breaking sentinel rather than a new
// GlobalRecommendedTarget shape.
export const HIRAGANA_TEST_STEP_ID = 'hiragana-test'
export const KATAKANA_TEST_STEP_ID = 'katakana-test'
const ASSESSMENT_STEPS: { script: AssessmentScript; afterCategoryId: string; activity: 'hiragana-test' | 'katakana-test'; rowId: string }[] = [
  { script: 'hiragana', afterCategoryId: 'hiragana', activity: 'hiragana-test', rowId: HIRAGANA_TEST_STEP_ID },
  { script: 'katakana', afterCategoryId: 'katakana', activity: 'katakana-test', rowId: KATAKANA_TEST_STEP_ID },
]

// Single-row version of the same completion check used by
// getGlobalRecommendedTarget below — reused (not reimplemented) wherever a
// screen needs "is THIS ROW's Recommended Path finished?" for a specific
// row, e.g. gating the Chōon Guide's auto-display on Sokuon practice being
// done (see CategoryRowsPage). Deliberately the exact same rule as the
// Recommended Path itself, now including an approved Restaurant/Cafe
// checkpoint when one follows that row.
export function isRowRecommendedPathDone(
  row: GojuonRow,
  category: ScriptCategory,
  taughtRowIds: readonly string[],
  rowActivityCompletion: Record<string, RowActivityCompletion>,
): boolean {
  const completion = rowActivityCompletion[row.id]
  const introCompleted = taughtRowIds.includes(row.id) || completion?.tracing === true
  const checkpoint = checkpointAfterRow(row.id)
  return (
    getRecommendedActivity({
      learnStyle: category.learnStyle,
      introCompleted,
      kanaQuizCompleted: completion?.kanaQuiz === true,
      listeningCompleted: completion?.listening === true,
      wordBuilderCompleted: completion?.wordBuilder === true,
      checkpointMode: checkpoint?.mode,
      checkpointCompleted: completion?.checkpoint === true,
    }) === 'done'
  )
}

export type GlobalRecommendedTarget = {
  categoryId: string
  rowId: string
  activity: Exclude<RecommendedActivity, 'done'>
}

// The ONE app-wide Recommended Target — every screen (Home, Category/Row
// selection, Practice Hub) reads this SAME value instead of computing its
// own, so skipping ahead in the curriculum never produces more than one
// "recommended" thing at once (see docs referenced from Issue #25).
//
// Walks categories in their declared order, and within each category its
// real (non-summary) rows in curriculum order (`order` field), reusing
// getRecommendedActivity per row — the first row/activity that isn't
// 'done' is the target. null once every row in every category is done.
// Restaurant/Cafe checkpoints live after their configured row in this same
// sequence, but their score remains irrelevant to progression.
// Deliberately does NOT consider Review/SRS/mastery — this reflects
// recommended-ROUTE progress, not proficiency.
export function getGlobalRecommendedTarget(
  rows: readonly GojuonRow[],
  categories: readonly ScriptCategory[],
  taughtRowIds: readonly string[],
  rowActivityCompletion: Record<string, RowActivityCompletion>,
  assessmentCompletion: Partial<Record<AssessmentScript, boolean>> = {},
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
      const checkpoint = checkpointAfterRow(row.id)
      const activity = getRecommendedActivity({
        learnStyle: category.learnStyle,
        introCompleted,
        kanaQuizCompleted: completion?.kanaQuiz === true,
        listeningCompleted: completion?.listening === true,
        wordBuilderCompleted: completion?.wordBuilder === true,
        checkpointMode: checkpoint?.mode,
        checkpointCompleted: completion?.checkpoint === true,
      })
      if (activity !== 'done') return { categoryId: category.id, rowId: row.id, activity }
    }

    const assessmentStep = ASSESSMENT_STEPS.find((step) => step.afterCategoryId === category.id)
    if (assessmentStep && assessmentCompletion[assessmentStep.script] !== true) {
      return { categoryId: category.id, rowId: assessmentStep.rowId, activity: assessmentStep.activity }
    }
  }
  return null
}
