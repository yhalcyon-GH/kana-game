import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getNextRowId, ROWS, ROWS_BY_ID } from '../data/curriculum'
import { meetsAdvanceThreshold, nextBox } from '../lib/srs'

export type CharacterProgress = {
  box: number
  totalSeen: number
  totalCorrect: number
  lastSeen: number
  // Whether the most recent attempt was correct — drives lib/srs.ts's
  // isWeak (Review's "weak items" lists), which is deliberately NOT box-
  // based (see that function's comment). Optional so pre-existing
  // persisted progress (recorded before this field existed) reads as
  // undefined rather than false, so it doesn't retroactively flood the
  // weak list — isWeak only treats an explicit `false` as a miss.
  lastCorrect?: boolean
}

const FIRST_ROW_ID = 'a-row'

type ProgressState = {
  characters: Record<string, CharacterProgress>
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
  return { box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0 }
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      characters: {},
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
            box: nextBox(prev.box, correct),
            totalSeen: prev.totalSeen + 1,
            totalCorrect: prev.totalCorrect + (correct ? 1 : 0),
            lastSeen: Date.now(),
            lastCorrect: correct,
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
        if (!row) return false
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
      version: 4,
      // v1 -> v2: the default pronunciation speed changed from 1x to 0.5x;
      // carry that new default into browsers that already persisted a v1
      // state (which would otherwise keep the old 1x forever).
      // v2 -> v3: the speed slider's range tightened from 0.5x-2x to
      // 0.75x-1.5x (the extremes made played-back audio hard to recognize —
      // slowed clips lost consonants, sped-up clips turned shrill). Clamp
      // any already-persisted value into the new range.
      // v3 -> v4: default pronunciation speed changed again, this time to
      // 1x — same "carry the new default forward" treatment as v1 -> v2.
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
        return state
      },
    },
  ),
)
