import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getNextRowId, ROWS, ROWS_BY_ID } from '../data/curriculum'
import { applyReviewResult, MAX_BOX, meetsAdvanceThreshold, MIN_BOX, nextBox, REVIEW_STREAK_TARGET } from '../lib/srs'

export type CharacterProgress = {
  box: number
  totalSeen: number
  totalCorrect: number
  lastSeen: number
  // Active/streak Review state — see lib/srs.ts's applyReviewResult for how
  // each game updates this. Drives Review inclusion; independent of `box`,
  // which only drives row-unlock timing and practice-queue weighting.
  reviewActive: boolean
  reviewStreak: number
}

export type WordProgress = {
  // Same active/streak model as CharacterProgress, but tracked per word
  // rather than derived from its characters — a word gets its own state
  // directly from the word-based games (Kana Typing/Listening/Word
  // Builder; Kana Quiz has no word involved). See lib/srs.ts.
  reviewActive: boolean
  reviewStreak: number
}

// One flag per Recommended Path activity a row can complete — see
// lib/recommendedPath.ts. Each flag means only "the learner reached this
// activity's normal end-of-session summary at least once for this row",
// nothing about accuracy or mastery (see isRowMastered, a separate,
// already-dynamic box-based concept this deliberately does not touch).
// `learn` is NOT tracked here — the existing `taughtRowIds` (see
// markRowTaught) already is that flag. Kana Typing has no flag because it's
// optional. `checkpoint` is the score-independent Restaurant/Cafe step that
// follows selected rows (Issue #183); it never feeds Review/SRS/mastery.
export type RowActivityCompletion = {
  tracing?: boolean
  kanaQuiz?: boolean
  listening?: boolean
  wordBuilder?: boolean
  checkpoint?: boolean
}

const ROW_ACTIVITY_KEYS = ['tracing', 'kanaQuiz', 'listening', 'wordBuilder', 'checkpoint'] as const
export type RowActivityKey = (typeof ROW_ACTIVITY_KEYS)[number]

// Hiragana/Katakana Test completion (Issue #189, Phase 1) — deliberately
// the ONLY thing persisted for the assessment: per the issue's
// "Progression behavior" section, score must never gate curriculum
// progression, so only a score-independent completed flag is stored, plus
// `lastScore` purely for display (e.g. re-showing the last result on
// AssessmentPage without forcing a retake) — never read by any
// Review/SRS/mastery/unlock code path. Keyed by script id, not a full row,
// since the assessment is a section-level endpoint, not an ordinary row
// (see curriculum.ts's SUMMARY_ROW_SOURCE_CATEGORY_IDS naming convention
// for why 'hiragana'/'katakana' are used as keys instead of a synthetic
// row id).
export type AssessmentScript = 'hiragana' | 'katakana' | 'sokuon-chouon' | 'youon-special-katakana'
export type AssessmentCompletion = {
  completed: boolean
  lastScore?: { correct: number; total: number }
  completedAt?: number
}
const ASSESSMENT_SCRIPTS: AssessmentScript[] = ['hiragana', 'katakana', 'sokuon-chouon', 'youon-special-katakana']

// "Continue" (Home's resume card, Issue #23) — deliberately separate from
// Recommended Path: this just remembers the last real learning/practice
// screen visited (Learn or one of the 5 game pages) for a real, non-summary
// row, so Home can offer a one-tap way back into it. Never touched by
// Recommended Path/completion/Review/SRS/mastery logic, and the Practice
// Hub itself + Review scope are deliberately never recorded as resume
// targets (see lib/lastStudied.ts's resumable-route matcher).
const RESUMABLE_ACTIVITY_KEYS = ['learn', 'tracing', 'kanaQuiz', 'listening', 'wordBuilder', 'kanaTyping'] as const
export type ResumableActivity = (typeof RESUMABLE_ACTIVITY_KEYS)[number]
export type LastStudied = { categoryId: string; rowId: string; activity: ResumableActivity }

const FIRST_ROW_ID = 'a-row'
const MIN_AUDIO_SPEED = 0.75
const MAX_AUDIO_SPEED = 1.5
const MIN_VOLUME = 0
const MAX_VOLUME = 2

type ProgressState = {
  characters: Record<string, CharacterProgress>
  words: Record<string, WordProgress>
  unlockedRowIds: string[]
  taughtRowIds: string[]
  // Recommended Path completion — see RowActivityCompletion's comment.
  // Keyed by rowId; a row with nothing completed yet simply has no entry.
  rowActivityCompletion: Record<string, RowActivityCompletion>
  // Hiragana/Katakana Test completion — see AssessmentCompletion's comment.
  assessmentCompletion: Record<AssessmentScript, AssessmentCompletion>
  // null until the learner has visited at least one resumable screen — see
  // LastStudied's comment. Home's Continue card simply doesn't render then.
  lastStudied: LastStudied | null
  audioEnabled: boolean
  audioVolume: number
  audioSpeed: number
  // Practice-only romaji hints (Listening/Word Builder) default to hidden
  // per-question, revealed via a small "Show romaji" control — this setting
  // opts into showing them from the start instead. Does NOT affect Learn/
  // Tracing (always show romaji, unconditionally), Kana Quiz (Read/Recall
  // already have their own correct romaji behavior), or Kana Typing (never
  // shows target romaji during a question, by design).
  alwaysShowRomajiHints: boolean
  // Tamamizu's per-answer/result-screen reaction voice (public/audio/
  // feedback/*.wav) — separate from `audioEnabled`, which gates
  // pronunciation audio (characters/words). See useTTS.ts's speak().
  mascotVoiceEnabled: boolean
  // Adjusted independently from `audioVolume` — same 0-2 gain-boost scale
  // (see audioVolume's comment), applied only to feedback/* clips.
  mascotVoiceVolume: number
  // Tamamizu Guide Phase 1 (Issue #29) — the one-time first-launch
  // introduction (see components/IntroGuide.tsx). true once the learner has
  // finished OR skipped it; Settings' "View introduction again" can still
  // replay it on demand without flipping this back — see
  // setHasCompletedIntroGuide's own comment.
  hasCompletedIntroGuide: boolean
  // Tamamizu Guide Phase 2 (Issue #33) — independent one-time explanation
  // for choosing Learn or Tracing on the first Hiragana row. Pure UI state;
  // it must never affect any learning or recommendation state.
  hasCompletedLearnTracingGuide: boolean
  // Tamamizu Guide Phase 3 (Issue #35) — independent one-time explanation
  // of Practice and Recommended after the first Hiragana introduction.
  hasCompletedPracticeGuide: boolean
  // Tamamizu Guide Phase 4 (Issue #40) — independent one-time explanation
  // shown on a stable summary after the first Review target is created.
  hasCompletedReviewGuide: boolean
  // Tamamizu concept guide (Issue #44) — independent one-time explanation
  // shown when the first Sokuon lesson is opened. Pure UI state only.
  hasCompletedSokuonGuide: boolean
  // Tamamizu Guide — independent one-time explanation shown when the first
  // Chōon lesson is opened. Pure UI state only.
  hasCompletedChouonGuide: boolean
  // Tamamizu Guide (Issue #50) — independent one-time explanation shown
  // when the first Yōon lesson is opened. Pure UI state only.
  hasCompletedYouonGuide: boolean
  // Tamamizu Guide — independent one-time explanation shown when Special
  // Katakana's first session (special-katakana-fa-row) is first opened, NOT
  // just from visiting the shared /youon page. Pure UI state only.
  hasCompletedSpecialKatakanaGuide: boolean
  // KanaIntroExcerptGuide auto-display (mobile QA polish round) — one flag
  // per section (Hiragana/Katakana), each independent: seeing the excerpt
  // via one section must never suppress the other's own first-time
  // auto-show. Pure UI state only, never touched by manual Ask Tamamizu
  // replay.
  hasCompletedHiraganaSectionGuide: boolean
  hasCompletedKatakanaSectionGuide: boolean
  // Tamamizu Guide (particle guide, は/へ/を pronunciation) — independent
  // one-time flag for the "Ask Tamamizu about particles" button on the
  // Hiragana page. No curriculum row triggers this automatically (see
  // particleGuide.ts); set true only the first time a learner reaches the
  // Guide's own final completion. A later manual replay of the same button
  // must never reset it back to false or otherwise mutate progress state.
  hasCompletedParticleGuide: boolean

  ensureCharacterInitialized: (charId: string) => void
  recordResult: (charId: string, correct: boolean) => void
  recordCharacterReviewResult: (charId: string, correct: boolean) => void
  recordWordReviewResult: (wordId: string, correct: boolean) => void
  markRowTaught: (rowId: string) => void
  // Marks one Recommended Path activity completed for a row — call only
  // when its normal session reaches the real end-of-session summary, never
  // on open/partial-play. Review-scoped sessions must not call this.
  // Restaurant/Cafe use the `checkpoint` key after all 8 questions; their
  // score remains irrelevant and no Review/SRS/mastery state is touched.
  markRowActivityCompleted: (rowId: string, activity: RowActivityKey) => void
  isRowActivityCompleted: (rowId: string, activity: RowActivityKey) => boolean
  // Marks a Hiragana/Katakana Test completed — call only once the learner
  // has answered all 20 questions (score irrelevant, see
  // AssessmentCompletion's comment). `score` is stored purely for display.
  markAssessmentCompleted: (script: AssessmentScript, score: { correct: number; total: number }) => void
  isAssessmentCompleted: (script: AssessmentScript) => boolean
  // Pure navigation bookkeeping for Continue (Issue #23) — never touches
  // Recommended Path/completion/Review/SRS/mastery.
  setLastStudied: (entry: LastStudied) => void
  isRowUnlocked: (rowId: string) => boolean
  isRowTaught: (rowId: string) => boolean
  isRowMastered: (rowId: string) => boolean
  setAudioEnabled: (enabled: boolean) => void
  setAudioVolume: (volume: number) => void
  setAudioSpeed: (speed: number) => void
  setAlwaysShowRomajiHints: (show: boolean) => void
  setMascotVoiceEnabled: (enabled: boolean) => void
  setMascotVoiceVolume: (volume: number) => void
  // Pure UI bookkeeping — never touches unlock/taught/completion/Review/
  // SRS/mastery. Settings' "View introduction again" calls this with
  // `false` to reopen the guide (IntroGuide sets it back to `true` again on
  // its own completion/Skip), so replaying never permanently loses the
  // "already introduced" state beyond the current viewing.
  setHasCompletedIntroGuide: (completed: boolean) => void
  setHasCompletedLearnTracingGuide: (completed: boolean) => void
  setHasCompletedPracticeGuide: (completed: boolean) => void
  setHasCompletedReviewGuide: (completed: boolean) => void
  setHasCompletedSokuonGuide: (completed: boolean) => void
  setHasCompletedChouonGuide: (completed: boolean) => void
  setHasCompletedYouonGuide: (completed: boolean) => void
  setHasCompletedSpecialKatakanaGuide: (completed: boolean) => void
  setHasCompletedHiraganaSectionGuide: (completed: boolean) => void
  setHasCompletedKatakanaSectionGuide: (completed: boolean) => void
  setHasCompletedParticleGuide: (completed: boolean) => void
  resetProgress: () => void
}

function blankCharacterProgress(): CharacterProgress {
  return { box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0, reviewActive: false, reviewStreak: 0 }
}

function blankWordProgress(): WordProgress {
  return { reviewActive: false, reviewStreak: 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampFiniteOr(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return Math.min(maximum, Math.max(minimum, finiteOr(value, fallback)))
}

function nonNegativeIntegerOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

function srsBoxOr(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(MAX_BOX, Math.max(MIN_BOX, value)) : MIN_BOX
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

// A streak is only ever meaningful while active (an inactive item's streak
// is always 0, see applyReviewResult) and can never legitimately reach
// REVIEW_STREAK_TARGET itself (that value graduates the item, resetting the
// streak back to 0 in the same step) — so anything outside [0,
// REVIEW_STREAK_TARGET) is corrupt/stale data, not a valid in-progress streak.
function reviewProgressOr(candidate: Record<string, unknown>): { reviewActive: boolean; reviewStreak: number } {
  const reviewActive = booleanOr(candidate.reviewActive, false)
  if (!reviewActive) return { reviewActive: false, reviewStreak: 0 }
  const streak = candidate.reviewStreak
  const reviewStreak = typeof streak === 'number' && Number.isInteger(streak) && streak >= 0 && streak < REVIEW_STREAK_TARGET ? streak : 0
  return { reviewActive: true, reviewStreak }
}

function assessmentCompletionOr(value: unknown, fallback: AssessmentCompletion): AssessmentCompletion {
  const candidate = isRecord(value) ? value : {}
  const completed = booleanOr(candidate.completed, fallback.completed)
  if (!completed) return { completed: false }
  const scoreCandidate = isRecord(candidate.lastScore) ? candidate.lastScore : undefined
  const lastScore = scoreCandidate
    ? { correct: nonNegativeIntegerOr(scoreCandidate.correct, 0), total: nonNegativeIntegerOr(scoreCandidate.total, 0) }
    : undefined
  const completedAt = typeof candidate.completedAt === 'number' && Number.isFinite(candidate.completedAt) ? candidate.completedAt : undefined
  return { completed: true, lastScore, completedAt }
}

function rowActivityCompletionOr(value: unknown): RowActivityCompletion {
  const candidate = isRecord(value) ? value : {}
  const result: RowActivityCompletion = {}
  for (const key of ROW_ACTIVITY_KEYS) {
    if (candidate[key] === true) result[key] = true
  }
  return result
}

function lastStudiedOr(value: unknown): LastStudied | null {
  if (!isRecord(value)) return null
  const { categoryId, rowId, activity } = value
  if (typeof categoryId !== 'string' || !categoryId) return null
  if (typeof rowId !== 'string' || !rowId) return null
  if (typeof activity !== 'string' || !(RESUMABLE_ACTIVITY_KEYS as readonly string[]).includes(activity)) return null
  // Defensive against stale data (e.g. a row removed/renamed since this was
  // saved) — a Continue card must never point at a nonexistent or summary
  // row (see lib/lastStudied.ts's resumable-route matcher, which excludes
  // summary rows the same way when recording).
  const row = ROWS_BY_ID[rowId]
  if (!row || row.isSummary || row.categoryId !== categoryId) return null
  return { categoryId, rowId, activity: activity as ResumableActivity }
}

export function mergePersistedProgress(persistedState: unknown, currentState: ProgressState): ProgressState {
  const persisted = isRecord(persistedState) ? persistedState : {}
  const rawCharacters = isRecord(persisted.characters) ? persisted.characters : {}
  const rawWords = isRecord(persisted.words) ? persisted.words : {}

  const characters = Object.fromEntries(
    Object.entries(rawCharacters).map(([id, value]) => {
      const candidate = isRecord(value) ? value : {}
      const totalSeen = nonNegativeIntegerOr(candidate.totalSeen, 0)
      return [
        id,
        {
          box: srsBoxOr(candidate.box),
          totalSeen,
          totalCorrect: Math.min(nonNegativeIntegerOr(candidate.totalCorrect, 0), totalSeen),
          lastSeen: nonNegativeIntegerOr(candidate.lastSeen, 0),
          ...reviewProgressOr(candidate),
        },
      ]
    }),
  )
  const words = Object.fromEntries(
    Object.entries(rawWords).map(([id, value]) => [id, reviewProgressOr(isRecord(value) ? value : {})]),
  )

  return {
    ...currentState,
    characters,
    words,
    unlockedRowIds: stringArrayOr(persisted.unlockedRowIds, currentState.unlockedRowIds),
    taughtRowIds: stringArrayOr(persisted.taughtRowIds, currentState.taughtRowIds),
    rowActivityCompletion: Object.fromEntries(
      Object.entries(isRecord(persisted.rowActivityCompletion) ? persisted.rowActivityCompletion : {})
        .map(([rowId, value]) => [rowId, rowActivityCompletionOr(value)])
        .filter(([, completion]) => Object.keys(completion as RowActivityCompletion).length > 0),
    ),
    assessmentCompletion: Object.fromEntries(
      ASSESSMENT_SCRIPTS.map((script) => [
        script,
        assessmentCompletionOr(
          isRecord(persisted.assessmentCompletion) ? persisted.assessmentCompletion[script] : undefined,
          currentState.assessmentCompletion[script],
        ),
      ]),
    ) as Record<AssessmentScript, AssessmentCompletion>,
    audioEnabled: booleanOr(persisted.audioEnabled, currentState.audioEnabled),
    audioVolume: clampFiniteOr(persisted.audioVolume, MIN_VOLUME, MAX_VOLUME, currentState.audioVolume),
    audioSpeed: clampFiniteOr(persisted.audioSpeed, MIN_AUDIO_SPEED, MAX_AUDIO_SPEED, currentState.audioSpeed),
    lastStudied: lastStudiedOr(persisted.lastStudied),
    alwaysShowRomajiHints: booleanOr(persisted.alwaysShowRomajiHints, currentState.alwaysShowRomajiHints),
    hasCompletedIntroGuide: booleanOr(persisted.hasCompletedIntroGuide, currentState.hasCompletedIntroGuide),
    hasCompletedLearnTracingGuide: booleanOr(persisted.hasCompletedLearnTracingGuide, currentState.hasCompletedLearnTracingGuide),
    hasCompletedPracticeGuide: booleanOr(persisted.hasCompletedPracticeGuide, currentState.hasCompletedPracticeGuide),
    hasCompletedReviewGuide: booleanOr(persisted.hasCompletedReviewGuide, currentState.hasCompletedReviewGuide),
    hasCompletedSokuonGuide: booleanOr(persisted.hasCompletedSokuonGuide, currentState.hasCompletedSokuonGuide),
    hasCompletedChouonGuide: booleanOr(persisted.hasCompletedChouonGuide, currentState.hasCompletedChouonGuide),
    hasCompletedYouonGuide: booleanOr(persisted.hasCompletedYouonGuide, currentState.hasCompletedYouonGuide),
    hasCompletedSpecialKatakanaGuide: booleanOr(
      persisted.hasCompletedSpecialKatakanaGuide,
      currentState.hasCompletedSpecialKatakanaGuide,
    ),
    hasCompletedHiraganaSectionGuide: booleanOr(persisted.hasCompletedHiraganaSectionGuide, currentState.hasCompletedHiraganaSectionGuide),
    hasCompletedKatakanaSectionGuide: booleanOr(persisted.hasCompletedKatakanaSectionGuide, currentState.hasCompletedKatakanaSectionGuide),
    hasCompletedParticleGuide: booleanOr(persisted.hasCompletedParticleGuide, currentState.hasCompletedParticleGuide),
    mascotVoiceEnabled: booleanOr(persisted.mascotVoiceEnabled, currentState.mascotVoiceEnabled),
    mascotVoiceVolume: clampFiniteOr(persisted.mascotVoiceVolume, MIN_VOLUME, MAX_VOLUME, currentState.mascotVoiceVolume),
  }
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      characters: {},
      words: {},
      unlockedRowIds: [FIRST_ROW_ID],
      taughtRowIds: [],
      rowActivityCompletion: {},
        assessmentCompletion: { hiragana: { completed: false }, katakana: { completed: false }, 'sokuon-chouon': { completed: false }, 'youon-special-katakana': { completed: false } },
      lastStudied: null,
      audioEnabled: true,
      audioVolume: 1,
      audioSpeed: 1,
      alwaysShowRomajiHints: false,
      mascotVoiceEnabled: true,
      mascotVoiceVolume: 1,
      hasCompletedIntroGuide: false,
      hasCompletedLearnTracingGuide: false,
      hasCompletedPracticeGuide: false,
      hasCompletedReviewGuide: false,
      hasCompletedSokuonGuide: false,
      hasCompletedChouonGuide: false,
      hasCompletedYouonGuide: false,
      hasCompletedSpecialKatakanaGuide: false,
      hasCompletedHiraganaSectionGuide: false,
      hasCompletedKatakanaSectionGuide: false,
      hasCompletedParticleGuide: false,

      ensureCharacterInitialized: (charId) => {
        if (get().characters[charId]) return
        set((state) => ({
          characters: { ...state.characters, [charId]: blankCharacterProgress() },
        }))
      },

      recordResult: (charId, correct) => {
        set((state) => {
          const prev = state.characters[charId] ?? blankCharacterProgress()
          const updated: CharacterProgress = {
            ...prev,
            box: nextBox(prev.box, correct),
            totalSeen: prev.totalSeen + 1,
            totalCorrect: prev.totalCorrect + (correct ? 1 : 0),
            lastSeen: Date.now(),
          }
          return { characters: { ...state.characters, [charId]: updated } }
        })

        const char = get().characters[charId]
        const row = ROWS.find((r) => r.characterIds.includes(charId))
        if (!char || !row) return

        const rowMeetsThreshold = row.characterIds.every((id) => {
          const stats = get().characters[id]
          return stats ? meetsAdvanceThreshold(stats) : false
        })
        if (!rowMeetsThreshold) return

        const nextRowId = getNextRowId(row.id)
        if (nextRowId && !get().unlockedRowIds.includes(nextRowId)) {
          set((state) => ({ unlockedRowIds: [...state.unlockedRowIds, nextRowId] }))
        }
      },

      recordCharacterReviewResult: (charId, correct) => {
        set((state) => {
          const prev = state.characters[charId] ?? blankCharacterProgress()
          return { characters: { ...state.characters, [charId]: { ...prev, ...applyReviewResult(prev, correct) } } }
        })
      },

      recordWordReviewResult: (wordId, correct) => {
        set((state) => {
          const prev = state.words[wordId] ?? blankWordProgress()
          return { words: { ...state.words, [wordId]: applyReviewResult(prev, correct) } }
        })
      },

      markRowTaught: (rowId) => {
        const row = ROWS_BY_ID[rowId]
        if (!row) return
        for (const charId of row.characterIds) {
          get().ensureCharacterInitialized(charId)
        }
        if (!get().taughtRowIds.includes(rowId)) {
          set((state) => ({ taughtRowIds: [...state.taughtRowIds, rowId] }))
        }
      },

      markRowActivityCompleted: (rowId, activity) => {
        set((state) => ({
          rowActivityCompletion: {
            ...state.rowActivityCompletion,
            [rowId]: { ...state.rowActivityCompletion[rowId], [activity]: true },
          },
        }))
      },
      isRowActivityCompleted: (rowId, activity) => get().rowActivityCompletion[rowId]?.[activity] === true,

      markAssessmentCompleted: (script, score) => {
        set((state) => ({
          assessmentCompletion: {
            ...state.assessmentCompletion,
            [script]: { completed: true, lastScore: score, completedAt: Date.now() },
          },
        }))
      },
      isAssessmentCompleted: (script) => get().assessmentCompletion[script]?.completed === true,

      setLastStudied: (entry) => set({ lastStudied: entry }),

      isRowUnlocked: (rowId) => get().unlockedRowIds.includes(rowId),
      isRowTaught: (rowId) => get().taughtRowIds.includes(rowId),
      isRowMastered: (rowId) => {
        const row = ROWS_BY_ID[rowId]
        // A row with no characterIds of its own (chōon — see curriculum.ts's
        // comment on why those rows are `characterIds: []`) has nothing to
        // gate mastery on; `[].every(...)` is vacuously true, which used to
        // make every chōon row show "mastered" from the moment it unlocked.
        if (!row || row.characterIds.length === 0) return false
        return row.characterIds.every((id) => (get().characters[id]?.box ?? 0) >= 4)
      },

      setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),
      setAudioVolume: (volume) => set({ audioVolume: volume }),
      setAudioSpeed: (speed) => set({ audioSpeed: speed }),
      setAlwaysShowRomajiHints: (show) => set({ alwaysShowRomajiHints: show }),
      setHasCompletedIntroGuide: (completed) => set({ hasCompletedIntroGuide: completed }),
      setHasCompletedLearnTracingGuide: (completed) => set({ hasCompletedLearnTracingGuide: completed }),
      setHasCompletedPracticeGuide: (completed) => set({ hasCompletedPracticeGuide: completed }),
      setHasCompletedReviewGuide: (completed) => set({ hasCompletedReviewGuide: completed }),
      setHasCompletedSokuonGuide: (completed) => set({ hasCompletedSokuonGuide: completed }),
      setHasCompletedChouonGuide: (completed) => set({ hasCompletedChouonGuide: completed }),
      setHasCompletedYouonGuide: (completed) => set({ hasCompletedYouonGuide: completed }),
      setHasCompletedSpecialKatakanaGuide: (completed) => set({ hasCompletedSpecialKatakanaGuide: completed }),
      setHasCompletedHiraganaSectionGuide: (completed) => set({ hasCompletedHiraganaSectionGuide: completed }),
      setHasCompletedKatakanaSectionGuide: (completed) => set({ hasCompletedKatakanaSectionGuide: completed }),
      setHasCompletedParticleGuide: (completed) => set({ hasCompletedParticleGuide: completed }),
      setMascotVoiceEnabled: (enabled) => set({ mascotVoiceEnabled: enabled }),
      setMascotVoiceVolume: (volume) => set({ mascotVoiceVolume: volume }),

      resetProgress: () =>
        set({
          characters: {},
          words: {},
          unlockedRowIds: [FIRST_ROW_ID],
          taughtRowIds: [],
          rowActivityCompletion: {},
            assessmentCompletion: { hiragana: { completed: false }, katakana: { completed: false }, 'sokuon-chouon': { completed: false }, 'youon-special-katakana': { completed: false } },
          lastStudied: null,
          audioEnabled: true,
          audioVolume: 1,
          audioSpeed: 1,
          alwaysShowRomajiHints: false,
          mascotVoiceEnabled: true,
          mascotVoiceVolume: 1,
          hasCompletedIntroGuide: false,
          hasCompletedLearnTracingGuide: false,
          hasCompletedPracticeGuide: false,
          hasCompletedReviewGuide: false,
          hasCompletedSokuonGuide: false,
          hasCompletedChouonGuide: false,
          hasCompletedYouonGuide: false,
          hasCompletedSpecialKatakanaGuide: false,
          hasCompletedHiraganaSectionGuide: false,
          hasCompletedKatakanaSectionGuide: false,
          hasCompletedParticleGuide: false,
        }),
    }),
    {
      name: 'kana-game-progress',
      version: 20,
      // v1 -> v2: the default pronunciation speed changed from 1x to 0.5x;
      // carry that new default into browsers that already persisted a v1
      // state (which would otherwise keep the old 1x forever).
      // v2 -> v3: the speed slider's range tightened from 0.5x-2x to
      // 0.75x-1.5x (the extremes made played-back audio hard to recognize —
      // slowed clips lost consonants, sped-up clips turned shrill). Clamp
      // any already-persisted value into the new range.
      // v3 -> v4: default pronunciation speed changed again, this time to
      // 1x — same "carry the new default forward" treatment as v1 -> v2.
      // v4 -> v5: replaces the old due-date/lastCorrect-based Review logic
      // with per-character/per-word reviewScore (see lib/srs.ts) — backfill
      // every existing character with reviewScore 0 (dropping the now-
      // unused lastCorrect field) and add the new `words` map.
      // v5 -> v6: replaces the 0-10 reviewScore/threshold model with an
      // explicit active/streak pair (see lib/srs.ts's applyReviewResult) —
      // an old score at or above the old threshold (5) becomes an active
      // Review item with streak 0 (mirroring "you were failing this, keep
      // practicing it"); anything below becomes inactive. The streak always
      // starts at 0 either way, since the old score carried no record of a
      // partial correct-streak to resume.
      // v6 -> v7: adds Recommended Path completion tracking
      // (rowActivityCompletion, see RowActivityCompletion) — existing users
      // simply start with no activity marked completed for any row (an
      // empty object), same as a fresh install; nothing to backfill from.
      // v7 -> v8: がくせい/せんせい/いもうと moved from hiragana rows to
      // chōon rows (Issue #13), which changed their word ids (the id prefix
      // encodes the row). Remap any existing per-word Review state from the
      // old id to the new id so it isn't silently dropped.
      // v8 -> v9: replaces `showRomaji` (Issue #17) with
      // `alwaysShowRomajiHints` — a different setting with a different
      // default (see the migration below), not a rename.
      // v9 -> v10: adds `lastStudied` (Issue #23, Home's Continue card) —
      // brand new, no prior equivalent to backfill from.
      // v10 -> v11: adds `hasCompletedIntroGuide` (Issue #29, Tamamizu
      // Guide) — an existing installation is treated as already having
      // seen it (see the migration below), so it's never shown
      // retroactively.
      // v11 -> v12: adds the independent Learn/Tracing choice guide
      // (Issue #33). Unlike first-launch Introduction, it is intentionally
      // new for every learner until dismissed on the first Hiragana row.
      // v17 -> v18: adds hasCompletedHiraganaSectionGuide/
      // hasCompletedKatakanaSectionGuide (mobile QA polish round) — the
      // now-auto-displaying KanaIntroExcerptGuide gets its own independent
      // per-section completion flag, same as Sokuon/Chōon/Yōon. Existing
      // learners default to false for both, so they see the excerpt once
      // more next time they open each section — intended, not a bug.
      // v18 -> v19: adds hasCompletedSpecialKatakanaGuide (Special Katakana,
      // presented as a continuation of the /youon page — see curriculum.ts's
      // SPECIAL_KATAKANA_CATEGORY_ID) — same "new independent Guide flag,
      // defaults false" treatment as Sokuon/Chōon/Yōon before it.
      // v19 -> v20: Issue #155 moved ん into a-row and merged わ・を into the
      // final combined ra-row, deleting the standalone wa-row entirely. ん/
      // わ/を keep their character ids ('n'/'wa'/'wo'), so per-character
      // Review/box progress needs no migration. 13 words that lived under
      // wa-row moved to their new row and were renamed to match (same
      // "remap old word id -> new word id" treatment as the v7 -> v8
      // がくせい/せんせい/いもうと migration above). wa-row itself no longer
      // exists, so any stale unlockedRowIds/taughtRowIds/rowActivityCompletion
      // entry for it is folded into ra-row (the row it merged into) instead
      // of left dangling — lastStudied needs no migration here since
      // lastStudiedOr already nulls out any rowId no longer in ROWS_BY_ID.
      migrate: (persistedState, version) => {
        const state = (isRecord(persistedState) ? persistedState : {}) as Partial<ProgressState>
        if (version < 2) {
          state.audioSpeed = 0.5
        }
        if (version < 3) {
          state.audioSpeed = Math.min(1.5, Math.max(0.75, finiteOr(state.audioSpeed, 1)))
        }
        if (version < 4) {
          state.audioSpeed = 1
        }
        if (version < 5) {
          const characters = isRecord(state.characters) ? state.characters : {}
          for (const id of Object.keys(characters)) {
            const candidate: unknown = characters[id]
            if (!isRecord(candidate)) continue
            candidate.reviewScore = 0
            delete candidate.lastCorrect
          }
          state.characters = characters as Record<string, CharacterProgress>
          state.words = {}
        }
        if (version < 6) {
          const OLD_REVIEW_THRESHOLD = 5
          const migrateReviewFields = (candidate: Record<string, unknown>) => {
            const oldScore = finiteOr(candidate.reviewScore, 0)
            candidate.reviewActive = oldScore >= OLD_REVIEW_THRESHOLD
            candidate.reviewStreak = 0
            delete candidate.reviewScore
          }
          const characters = isRecord(state.characters) ? state.characters : {}
          for (const id of Object.keys(characters)) {
            const candidate: unknown = characters[id]
            if (isRecord(candidate)) migrateReviewFields(candidate)
          }
          state.characters = characters as Record<string, CharacterProgress>

          const words = isRecord(state.words) ? state.words : {}
          for (const id of Object.keys(words)) {
            const candidate: unknown = words[id]
            if (isRecord(candidate)) migrateReviewFields(candidate)
          }
          state.words = words as Record<string, WordProgress>
        }
        if (version < 7) {
          state.rowActivityCompletion = {}
        }
        if (version < 8) {
          const RENAMED_WORD_IDS: Record<string, string> = {
            'sa-gakusei': 'chouon-e-gakusei',
            'wa-sensei': 'chouon-e-sensei',
            'ma-imouto': 'chouon-o-imouto',
          }
          const words = isRecord(state.words) ? { ...state.words } : {}
          for (const [oldId, newId] of Object.entries(RENAMED_WORD_IDS)) {
            if (oldId in words) {
              words[newId] = words[oldId]
              delete words[oldId]
            }
          }
          state.words = words as Record<string, WordProgress>
        }
        if (version < 9) {
          // The old `showRomaji` (WordBuilder-only, session-wide, default
          // ON) is replaced by `alwaysShowRomajiHints` (Listening + Word
          // Builder per-question hint default, default OFF) — a different
          // setting with a different default, not a rename, so its value is
          // intentionally NOT carried forward.
          delete (state as Record<string, unknown>).showRomaji
          state.alwaysShowRomajiHints = false
        }
        if (version < 10) {
          // New in this version — no history to backfill, Continue simply
          // doesn't render for existing users until they visit something.
          state.lastStudied = null
        }
        if (version < 11) {
          // Tamamizu Guide Phase 1 (Issue #29) — an existing installation
          // (anything that had SOME prior persisted state, i.e. every
          // migration path through here) is treated as already having seen
          // the introduction, so it never pops up retroactively for a
          // returning learner. Only a genuinely fresh install (no
          // persisted state at all — see the initial store state above)
          // starts at false.
          state.hasCompletedIntroGuide = true
        }
        if (version < 12) {
          state.hasCompletedLearnTracingGuide = false
        }
        if (version < 13) {
          // New in this version: show after a learner next completes the
          // first Hiragana introduction, without changing any progress.
          state.hasCompletedPracticeGuide = false
        }
        if (version < 14) {
          state.hasCompletedReviewGuide = false
        }
        if (version < 15) {
          // New independent UI state. Existing learners see the explanation
          // the next time they open the first Sokuon lesson.
          state.hasCompletedSokuonGuide = false
        }
        if (version < 16) {
          // New independent UI state. Existing learners see the explanation
          // the next time they open the first Yōon lesson.
          state.hasCompletedYouonGuide = false
        }
        if (version < 17) {
          // New independent UI state. Existing learners see the explanation
          // the next time they open the first Chōon lesson.
          state.hasCompletedChouonGuide = false
        }
        if (version < 18) {
          state.hasCompletedHiraganaSectionGuide = false
          state.hasCompletedKatakanaSectionGuide = false
        }
        if (version < 19) {
          // New independent UI state. Existing learners see the explanation
          // the next time they open Special Katakana's first session.
          state.hasCompletedSpecialKatakanaGuide = false
        }
        if (version < 20) {
          const RENAMED_WORD_IDS: Record<string, string> = {
            'wa-en': 'a-en',
            'wa-tonkatsu': 'ta-tonkatsu',
            'wa-hon': 'ha-hon',
            'wa-nihon': 'ha-nihon',
            'wa-kanpai': 'ha-kanpai',
            'wa-nihongo': 'ha-nihongo',
            'wa-tenpura': 'ra-tenpura',
            'wa-watashi': 'ra-watashi',
            'wa-mizu-wo-nomu': 'ra-mizu-wo-nomu',
            'wa-niwatori': 'ra-niwatori',
            'wa-denwa': 'ra-denwa',
            'wa-konnichiwa': 'ra-konnichiwa',
            'wa-konbanwa': 'ra-konbanwa',
          }
          const words = isRecord(state.words) ? { ...state.words } : {}
          for (const [oldId, newId] of Object.entries(RENAMED_WORD_IDS)) {
            if (oldId in words) {
              words[newId] = words[oldId]
              delete words[oldId]
            }
          }
          state.words = words as Record<string, WordProgress>

          // wa-row no longer exists — fold any stale row-level bookkeeping
          // for it into ra-row (the row it merged into) rather than leave a
          // dangling, unreachable rowId around forever.
          const unlockedRowIds = stringArrayOr(state.unlockedRowIds, [])
          if (unlockedRowIds.includes('wa-row')) {
            const withRaRow = unlockedRowIds.includes('ra-row') ? unlockedRowIds : [...unlockedRowIds, 'ra-row']
            state.unlockedRowIds = withRaRow.filter((id) => id !== 'wa-row')
          }
          const taughtRowIds = stringArrayOr(state.taughtRowIds, [])
          if (taughtRowIds.includes('wa-row')) {
            const withRaRow = taughtRowIds.includes('ra-row') ? taughtRowIds : [...taughtRowIds, 'ra-row']
            state.taughtRowIds = withRaRow.filter((id) => id !== 'wa-row')
          }
          const rowActivityCompletion = isRecord(state.rowActivityCompletion) ? { ...state.rowActivityCompletion } : {}
          const waRowCompletion = rowActivityCompletion['wa-row']
          if (isRecord(waRowCompletion)) {
            const raRowCompletion = rowActivityCompletion['ra-row']
            rowActivityCompletion['ra-row'] = { ...(isRecord(raRowCompletion) ? raRowCompletion : {}), ...waRowCompletion }
          }
          delete rowActivityCompletion['wa-row']
          state.rowActivityCompletion = rowActivityCompletion as Record<string, RowActivityCompletion>
        }
        return state
      },
      merge: mergePersistedProgress,
    },
  ),
)
