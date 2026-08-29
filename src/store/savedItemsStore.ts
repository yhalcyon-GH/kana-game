import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Learner-curated "save for later" list — deliberately independent of
// progressStore's Review/SRS machinery (reviewActive/reviewStreak/box/
// mastery/Recommended Path/rowActivityCompletion/...): Saved is manually
// added and manually removed only, never auto-added by a wrong answer and
// never auto-removed by getting something right or graduating out of
// Review. An item can be Saved and in Review at the same time, Saved and
// NOT in Review, or vice versa — the two are unrelated booleans about the
// same character/word id. Persisted to its own localStorage key so
// Settings' Reset Progress (which only clears progressStore's state) never
// touches it. Stores ids only — display data (kana/meaning/image/...)
// always comes from CHARACTERS_BY_ID/WORDS_BY_ID, never duplicated here.
type SavedItemsState = {
  savedCharacterIds: string[]
  savedWordIds: string[]
  isCharacterSaved: (id: string) => boolean
  isWordSaved: (id: string) => boolean
  toggleCharacter: (id: string) => void
  toggleWord: (id: string) => void
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id]
}

export const useSavedItemsStore = create<SavedItemsState>()(
  persist(
    (set, get) => ({
      savedCharacterIds: [],
      savedWordIds: [],
      isCharacterSaved: (id) => get().savedCharacterIds.includes(id),
      isWordSaved: (id) => get().savedWordIds.includes(id),
      toggleCharacter: (id) => set((state) => ({ savedCharacterIds: toggleId(state.savedCharacterIds, id) })),
      toggleWord: (id) => set((state) => ({ savedWordIds: toggleId(state.savedWordIds, id) })),
    }),
    {
      name: 'kana-game-saved-items',
      version: 1,
    },
  ),
)
