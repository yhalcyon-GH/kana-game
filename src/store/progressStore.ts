import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getNextRowId, ROWS, ROWS_BY_ID } from '../data/curriculum'
import { clampReviewScore, meetsAdvanceThreshold, nextBox } from '../lib/srs'

export type CharacterProgress = {
  box: number
  totalSeen: number
  totalCorrect: number
  lastSeen: number
  // 0-10, clamped — see lib/srs.ts's needsReview/REVIEW_SCORE_* for how
  // each game adjusts this. Drives Review inclusion; independent of `box`,
  // which only drives row-unlock timing and practice-queue weighting.
  reviewScore: number
}

export type WordProgress = {
  // Same 0-10 scale as CharacterProgress.reviewScore, but tracked per word
  // rather than derived from its characters — a word gets its own score
  // directly from the word-based games (Kana Typing/Listening/Word
  // Builder; Kana Quiz has no word involved). See lib/srs.ts.
  reviewScore: number
}

const FIRST_ROW_ID = 'a-row'

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
  adjustCharacterReviewScore: (charId: string, delta: number) => void
  adjustWordReviewScore: (wordId: string, delta: number) => void
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
  return { box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0, reviewScore: 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function mergePersistedProgress(persistedState: unknown, currentState: ProgressState): ProgressState {
  const persisted = isRecord(persistedState) ? persistedState : {}
  const rawCharacters = isRecord(persisted.characters) ? persisted.characters : {}
  const rawWords = isRecord(persisted.words) ? persisted.words : {}

  const characters = Object.fromEntries(
    Object.entries(rawCharacters).map(([id, value]) => {
      const candidate = isRecord(value) ? value : {}
      return [
        id,
        {
          box: finiteOr(candidate.box, 0),
          totalSeen: finiteOr(candidate.totalSeen, 0),
          totalCorrect: finiteOr(candidate.totalCorrect, 0),
          lastSeen: finiteOr(candidate.lastSeen, 0),
          reviewScore: clampReviewScore(finiteOr(candidate.reviewScore, 0)),
        },
      ]
    }),
  )
  const words = Object.fromEntries(
    Object.entries(rawWords).map(([id, value]) => [
      id,
      { reviewScore: clampReviewScore(finiteOr(isRecord(value) ? value.reviewScore : 0, 0)) },
    ]),
  )

  return {
    ...currentState,
    characters,
    words,
    unlockedRowIds: stringArrayOr(persisted.unlockedRowIds, currentState.unlockedRowIds),
    taughtRowIds: stringArrayOr(persisted.taughtRowIds, currentState.taughtRowIds),
    audioEnabled: booleanOr(persisted.audioEnabled, currentState.audioEnabled),
    audioVolume: finiteOr(persisted.audioVolume, currentState.audioVolume),
    audioSpeed: finiteOr(persisted.audioSpeed, currentState.audioSpeed),
    showRomaji: booleanOr(persisted.showRomaji, currentState.showRomaji),
    mascotVoiceEnabled: booleanOr(persisted.mascotVoiceEnabled, currentState.mascotVoiceEnabled),
    mascotVoiceVolume: finiteOr(persisted.mascotVoiceVolume, currentState.mascotVoiceVolume),
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

      adjustCharacterReviewScore: (charId, delta) => {
        set((state) => {
          const prev = state.characters[charId] ?? blankCharacterProgress()
          return {
            characters: {
              ...state.characters,
              [charId]: { ...prev, reviewScore: clampReviewScore(prev.reviewScore + delta) },
            },
          }
        })
      },

      adjustWordReviewScore: (wordId, delta) => {
        set((state) => {
          const prev = state.words[wordId] ?? { reviewScore: 0 }
          return { words: { ...state.words, [wordId]: { reviewScore: clampReviewScore(prev.reviewScore + delta) } } }
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
      version: 5,
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
      migrate: (persistedState, version) => {
        const state = persistedState as ProgressState
        if (version < 2) {
          state.audioSpeed = 0.5
        }
        if (version < 3) {
          state.audioSpeed = Math.min(1.5, Math.max(0.75, state.audioSpeed))
        }
        if (version < 4) {
          state.audioSpeed = 1
        }
        if (version < 5) {
          for (const id of Object.keys(state.characters ?? {})) {
            const c = state.characters[id] as CharacterProgress & { lastCorrect?: boolean }
            c.reviewScore = 0
            delete c.lastCorrect
          }
          state.words = {}
        }
        return state
      },
      merge: mergePersistedProgress,
    },
  ),
)
