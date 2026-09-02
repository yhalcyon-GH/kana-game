import type { AnchorWord } from '../../data/types'

// Shared types for the Hiragana/Katakana mixed assessment engine (Issue
// #189, phase 1 of #188). A "script policy" of 'hiragana' | 'katakana' picks
// which single script an assessment run is scoped to — script purity is
// strict (see assessmentScope.ts), never mixed.
export type AssessmentScript = 'hiragana' | 'katakana'
// Single canonical runtime list of AssessmentScript's members — imported by
// both recommendedPath.ts's ASSESSMENT_STEPS and progressStore.ts's
// assessment-completion validation instead of each redeclaring its own copy
// of the same 'hiragana' | 'katakana' set.
export const ASSESSMENT_SCRIPTS: readonly AssessmentScript[] = ['hiragana', 'katakana']

// The four fixed question families, 5 questions each per 20-question test —
// see planner.ts's buildAssessmentPlan.
export type AssessmentFamily = 'kana-quiz' | 'listening' | 'word-builder' | 'word-reading'

export type AssessmentScope = {
  script: AssessmentScript
  // Every quizzable character id belonging to this script (see
  // assessmentScope.ts) — the Kana Quiz target/distractor pool.
  characterIds: string[]
  // Every word belonging to this script's real (non-summary, non-similar-
  // letters) rows — the Listening/Word Builder/Word Reading candidate pool.
  words: AnchorWord[]
}

type BaseAssessmentQuestion = {
  // Stable per-question id (`${family}-${index within family}`) — used as a
  // React key and to correlate an answer back to its question.
  id: string
  family: AssessmentFamily
  // Every character id this question exercises, used by diagnostics to
  // attribute a wrong answer to specific weak kana regardless of family.
  coveredCharIds: string[]
}

export type KanaQuizAssessmentQuestion = BaseAssessmentQuestion & {
  family: 'kana-quiz'
  mode: 'read' | 'recall'
  targetCharId: string
  // Target + distractors, already shuffled — precomputed by the planner (not
  // at render time) so the whole plan stays reproducible from one seed.
  choiceCharIds: string[]
}

export type ListeningAssessmentQuestion = BaseAssessmentQuestion & {
  family: 'listening'
  targetWordId: string
  choiceWordIds: string[]
}

export type WordBuilderAssessmentQuestion = BaseAssessmentQuestion & {
  family: 'word-builder'
  targetWordId: string
  distractorCharIds: string[]
}

export type WordReadingAssessmentQuestion = BaseAssessmentQuestion & {
  family: 'word-reading'
  targetWordId: string
  // Correct word romaji + plausible same-script distractors, shuffled — the
  // "Choose in Romaji" fallback's choices.
  romajiChoiceWordIds: string[]
}

export type AssessmentQuestion =
  | KanaQuizAssessmentQuestion
  | ListeningAssessmentQuestion
  | WordBuilderAssessmentQuestion
  | WordReadingAssessmentQuestion

export type AssessmentPlan = {
  script: AssessmentScript
  questions: AssessmentQuestion[]
}

export type AssessmentAnswer = {
  questionId: string
  family: AssessmentFamily
  correct: boolean
  coveredCharIds: string[]
  targetWordId?: string
}

export type AssessmentFamilyScore = { correct: number; total: number }

export type AssessmentResult = {
  script: AssessmentScript
  correct: number
  total: number
  percent: number
  familyScores: Record<AssessmentFamily, AssessmentFamilyScore>
  weakCharIds: string[]
  weakWordIds: string[]
}

export type AssessmentRecommendation = {
  label: string
  to: string
  reason: AssessmentFamily
}
