import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getNextRowId, ROWS, ROWS_BY_ID } from '../data/curriculum'
import { meetsAdvanceThreshold, nextBox } from '../lib/srs'

export type CharacterProgress = {
  box: number
  totalSeen: number
  totalCorrect: number
  lastSeen: number
}

const FIRST_ROW_ID = 'a-row'

type ProgressState = {
  characters: Record<string, CharacterProgress>
  unlockedRowIds: string[]
  taughtRowIds: string[]
  audioEnabled: boolean

  ensureCharacterInitialized: (charId: string) => void
  recordResult: (charId: string, correct: boolean) => void
  markRowTaught: (rowId: string) => void
  isRowUnlocked: (rowId: string) => boolean
  isRowTaught: (rowId: string) => boolean
  isRowMastered: (rowId: string) => boolean
  setAudioEnabled: (enabled: boolean) => void
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

      resetProgress: () =>
        set({ characters: {}, unlockedRowIds: [FIRST_ROW_ID], taughtRowIds: [], audioEnabled: true }),
    }),
    { name: 'kana-game-progress', version: 1 },
  ),
)
