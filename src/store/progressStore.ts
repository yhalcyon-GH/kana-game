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
  audioEnabled: boolean
  audioVolume: number
  audioSpeed: number
  showRomaji: boolean
  // Tamamizu's per-answer/result-screen reaction voice (public/audio/
  // feedback/*.wav) — separate from `audioEnabled`, which gates
  // pronunciation audio (characters/words). See useTTS.ts's speak().
  mascotVoiceEnabled: boolean
  // Adjusted independently from `audioVolume` — same 0-2 gain-boost scale
  // (see audioVolume's comment), applied only to feedback/* clips.
  mascotVoiceVolume: number

  ensureCharacterInitialized: (charId: string) => void
  recordResult: (charId: string, correct: boolean) => void
  recordCharacterReviewResult: (charId: string, correct: boolean) => void
  recordWordReviewResult: (wordId: string, correct: boolean) => void
  markRowTaught: (rowId: string) => void
  isRowUnlocked: (rowId: string) => boolean
  isRowTaught: (rowId: string) => boolean
  isRowMastered: (rowId: string) => boolean
  setAudioEnabled: (enabled: boolean) => void
  setAudioVolume: (volume: number) => void
  setAudioSpeed: (speed: number) => void
  setShowRomaji: (show: boolean) => void
  setMascotVoiceEnabled: (enabled: boolean) => void
  setMascotVoiceVolume: (volume: number) => void
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
    audioEnabled: booleanOr(persisted.audioEnabled, currentState.audioEnabled),
    audioVolume: clampFiniteOr(persisted.audioVolume, MIN_VOLUME, MAX_VOLUME, currentState.audioVolume),
    audioSpeed: clampFiniteOr(persisted.audioSpeed, MIN_AUDIO_SPEED, MAX_AUDIO_SPEED, currentState.audioSpeed),
    showRomaji: booleanOr(persisted.showRomaji, currentState.showRomaji),
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
      audioEnabled: true,
      audioVolume: 1,
      audioSpeed: 1,
      showRomaji: true,
      mascotVoiceEnabled: true,
      mascotVoiceVolume: 1,

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
      setShowRomaji: (show) => set({ showRomaji: show }),
      setMascotVoiceEnabled: (enabled) => set({ mascotVoiceEnabled: enabled }),
      setMascotVoiceVolume: (volume) => set({ mascotVoiceVolume: volume }),

      resetProgress: () =>
        set({
          characters: {},
          words: {},
          unlockedRowIds: [FIRST_ROW_ID],
          taughtRowIds: [],
          audioEnabled: true,
          audioVolume: 1,
          audioSpeed: 1,
          showRomaji: true,
          mascotVoiceEnabled: true,
          mascotVoiceVolume: 1,
        }),
    }),
    {
      name: 'kana-game-progress',
      version: 6,
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
        return state
      },
      merge: mergePersistedProgress,
    },
  ),
)
