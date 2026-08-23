import { beforeEach, describe, expect, it } from 'vitest'
import { mergePersistedProgress, useProgressStore } from './progressStore'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

describe('progressStore', () => {
  it('backfills missing v6 maps and review fields during hydration', () => {
    const current = useProgressStore.getState()
    const merged = mergePersistedProgress(
      {
        characters: {
          a: { box: 1, totalSeen: 2, totalCorrect: 1, lastSeen: 123 },
        },
        taughtRowIds: ['a-row'],
      },
      current,
    )

    expect(merged.characters.a.reviewActive).toBe(false)
    expect(merged.characters.a.reviewStreak).toBe(0)
    expect(merged.words).toEqual({})
    expect(merged.unlockedRowIds).toEqual(['a-row'])
    expect(typeof merged.recordResult).toBe('function')
  })

  it('normalizes an invalid/out-of-range streak on an active item back to 0', () => {
    const current = useProgressStore.getState()
    const merged = mergePersistedProgress(
      { characters: { a: { box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0, reviewActive: true, reviewStreak: Number.NaN } } },
      current,
    )

    expect(merged.characters.a.reviewActive).toBe(true)
    expect(merged.characters.a.reviewStreak).toBe(0)
  })

  it('forces an inactive item\'s streak to 0 regardless of what was persisted', () => {
    const current = useProgressStore.getState()
    const merged = mergePersistedProgress(
      { characters: { a: { box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0, reviewActive: false, reviewStreak: 1 } } },
      current,
    )

    expect(merged.characters.a).toEqual({ box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0, reviewActive: false, reviewStreak: 0 })
  })

  it('clamps finite persisted audio settings to their supported UI ranges', () => {
    const current = useProgressStore.getState()
    const merged = mergePersistedProgress(
      { audioVolume: 3, audioSpeed: -1, mascotVoiceVolume: -0.5 },
      current,
    )

    expect(merged.audioVolume).toBe(2)
    expect(merged.audioSpeed).toBe(0.75)
    expect(merged.mascotVoiceVolume).toBe(0)
  })

  it('normalizes finite character progress to valid SRS values', () => {
    const current = useProgressStore.getState()
    const merged = mergePersistedProgress(
      {
        characters: {
          a: { box: -1, totalSeen: -2, totalCorrect: -3, lastSeen: -1, reviewActive: 'yes' },
          i: { box: 1.5, totalSeen: 2.5, totalCorrect: 3, lastSeen: 1.5, reviewActive: false },
          u: { box: 2, totalSeen: 2, totalCorrect: 3, lastSeen: 123, reviewActive: true, reviewStreak: 1 },
        },
      },
      current,
    )

    expect(merged.characters.a).toEqual({ box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0, reviewActive: false, reviewStreak: 0 })
    expect(merged.characters.i).toEqual({ box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0, reviewActive: false, reviewStreak: 0 })
    expect(merged.characters.u).toEqual({ box: 2, totalSeen: 2, totalCorrect: 2, lastSeen: 123, reviewActive: true, reviewStreak: 1 })
  })

  it('falls back to defaults for malformed maps and row arrays', () => {
    const current = useProgressStore.getState()
    const merged = mergePersistedProgress(
      { characters: null, words: null, unlockedRowIds: ['a-row', 1], taughtRowIds: 'a-row' },
      current,
    )

    expect(merged.characters).toEqual({})
    expect(merged.words).toEqual({})
    expect(merged.unlockedRowIds).toEqual(['a-row'])
    expect(merged.taughtRowIds).toEqual([])
  })

  it('retains valid persisted progress and settings values', () => {
    const current = useProgressStore.getState()
    const merged = mergePersistedProgress(
      {
        characters: {
          a: { box: 3, totalSeen: 5, totalCorrect: 4, lastSeen: 123, reviewActive: true, reviewStreak: 1 },
        },
        audioVolume: 1.5,
        audioSpeed: 1.25,
        mascotVoiceVolume: 0.5,
      },
      current,
    )

    expect(merged.characters.a).toEqual({ box: 3, totalSeen: 5, totalCorrect: 4, lastSeen: 123, reviewActive: true, reviewStreak: 1 })
    expect(merged.audioVolume).toBe(1.5)
    expect(merged.audioSpeed).toBe(1.25)
    expect(merged.mascotVoiceVolume).toBe(0.5)
  })

  it('hydrates a current-version partial storage envelope with default maps and actions intact', async () => {
    localStorage.setItem(
      'kana-game-progress',
      JSON.stringify({ version: 6, state: { characters: {}, taughtRowIds: ['a-row'] } }),
    )

    await useProgressStore.persist.rehydrate()

    const state = useProgressStore.getState()
    expect(state.words).toEqual({})
    expect(state.taughtRowIds).toEqual(['a-row'])
    expect(typeof state.recordResult).toBe('function')
  })

  it('finishes hydration with defaults when a legacy storage envelope has null state', async () => {
    localStorage.setItem('kana-game-progress', JSON.stringify({ version: 0, state: null }))

    await useProgressStore.persist.rehydrate()

    const state = useProgressStore.getState()
    expect(state.characters).toEqual({})
    expect(state.unlockedRowIds).toEqual(['a-row'])
    expect(typeof state.recordResult).toBe('function')
    expect(useProgressStore.persist.hasHydrated()).toBe(true)
  })

  it('starts with only a-row unlocked and no rows taught', () => {
    const state = useProgressStore.getState()
    expect(state.unlockedRowIds).toEqual(['a-row'])
    expect(state.taughtRowIds).toEqual([])
  })

  it('markRowTaught initializes every character in the row and marks it taught', () => {
    useProgressStore.getState().markRowTaught('a-row')
    const state = useProgressStore.getState()
    expect(state.taughtRowIds).toContain('a-row')
    for (const id of ['a', 'i', 'u', 'e', 'o']) {
      expect(state.characters[id]).toBeDefined()
      expect(state.characters[id].box).toBe(0)
    }
  })

  it('recordResult updates box/totalSeen/totalCorrect for a character', () => {
    useProgressStore.getState().recordResult('a', true)
    const stats = useProgressStore.getState().characters['a']
    expect(stats.box).toBe(1)
    expect(stats.totalSeen).toBe(1)
    expect(stats.totalCorrect).toBe(1)

    useProgressStore.getState().recordResult('a', false)
    const stats2 = useProgressStore.getState().characters['a']
    expect(stats2.box).toBe(0)
    expect(stats2.totalSeen).toBe(2)
    expect(stats2.totalCorrect).toBe(1)
  })

  // Regression: chōon rows have `characterIds: []` (they introduce no new
  // characters of their own — see curriculum.ts's comment). `[].every(...)`
  // is vacuously true, which used to make isRowMastered report every chōon
  // row as mastered from the moment it unlocked, before anything was ever
  // practiced.
  it('a row with no characterIds of its own (chōon) is never reported as mastered', () => {
    expect(useProgressStore.getState().isRowMastered('chouon-a-row')).toBe(false)
  })

  it('unlocks ka-row only once every a-row character clears the advance threshold', () => {
    const { recordResult } = useProgressStore.getState()
    const aRowChars = ['a', 'i', 'u', 'e', 'o']

    // Bring every character except 'o' past the threshold.
    for (const id of ['a', 'i', 'u', 'e']) {
      recordResult(id, true)
      recordResult(id, true)
      recordResult(id, true)
    }
    expect(useProgressStore.getState().unlockedRowIds).not.toContain('ka-row')

    // Now clear the last one.
    recordResult('o', true)
    recordResult('o', true)
    recordResult('o', true)
    expect(useProgressStore.getState().unlockedRowIds).toContain('ka-row')
    expect(aRowChars.every((id) => useProgressStore.getState().characters[id].box >= 2)).toBe(true)
  })

  it('resetProgress clears state back to the initial values', () => {
    useProgressStore.getState().recordResult('a', true)
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().resetProgress()
    const state = useProgressStore.getState()
    expect(state.characters).toEqual({})
    expect(state.unlockedRowIds).toEqual(['a-row'])
    expect(state.taughtRowIds).toEqual([])
  })

  describe('recordCharacterReviewResult', () => {
    it('a miss activates Review and resets the streak; two consecutive hits graduate it', () => {
      const { recordCharacterReviewResult } = useProgressStore.getState()
      recordCharacterReviewResult('a', false)
      expect(useProgressStore.getState().characters['a']).toMatchObject({ reviewActive: true, reviewStreak: 0 })

      recordCharacterReviewResult('a', true)
      expect(useProgressStore.getState().characters['a']).toMatchObject({ reviewActive: true, reviewStreak: 1 })

      recordCharacterReviewResult('a', true)
      expect(useProgressStore.getState().characters['a']).toMatchObject({ reviewActive: false, reviewStreak: 0 })
    })

    it('a miss at streak 1/2 resets to 0/2 instead of graduating', () => {
      const { recordCharacterReviewResult } = useProgressStore.getState()
      recordCharacterReviewResult('a', false)
      recordCharacterReviewResult('a', true)
      expect(useProgressStore.getState().characters['a']).toMatchObject({ reviewActive: true, reviewStreak: 1 })

      recordCharacterReviewResult('a', false)
      expect(useProgressStore.getState().characters['a']).toMatchObject({ reviewActive: true, reviewStreak: 0 })
    })

    it('initializes a not-yet-seen character rather than throwing', () => {
      useProgressStore.getState().recordCharacterReviewResult('unseen-char', false)
      expect(useProgressStore.getState().characters['unseen-char']).toMatchObject({ reviewActive: true, reviewStreak: 0 })
    })

    it('a correct answer on an item never marked weak is a no-op', () => {
      useProgressStore.getState().recordCharacterReviewResult('a', true)
      expect(useProgressStore.getState().characters['a']).toMatchObject({ reviewActive: false, reviewStreak: 0 })
    })
  })

  describe('recordWordReviewResult', () => {
    it('a miss activates Review and resets the streak; two consecutive hits graduate it, initializing a not-yet-seen word', () => {
      const { recordWordReviewResult } = useProgressStore.getState()
      recordWordReviewResult('a-ai', false)
      expect(useProgressStore.getState().words['a-ai']).toEqual({ reviewActive: true, reviewStreak: 0 })

      recordWordReviewResult('a-ai', true)
      expect(useProgressStore.getState().words['a-ai']).toEqual({ reviewActive: true, reviewStreak: 1 })

      recordWordReviewResult('a-ai', true)
      expect(useProgressStore.getState().words['a-ai']).toEqual({ reviewActive: false, reviewStreak: 0 })
    })
  })

  // v5 -> v6: the persisted store used to track a 0-10 reviewScore per
  // character/word (threshold 5). See progressStore.ts's migrate() comment.
  describe('v5 -> v6 review-field migration', () => {
    it('converts an old score at/above the threshold to an active item with streak 0', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({
          version: 5,
          state: {
            characters: { a: { box: 1, totalSeen: 1, totalCorrect: 1, lastSeen: 1, reviewScore: 7 } },
            words: { 'a-ai': { reviewScore: 5 } },
          },
        }),
      )

      await useProgressStore.persist.rehydrate()

      const state = useProgressStore.getState()
      expect(state.characters['a']).toMatchObject({ reviewActive: true, reviewStreak: 0 })
      expect(state.words['a-ai']).toEqual({ reviewActive: true, reviewStreak: 0 })
    })

    it('converts an old score below the threshold to an inactive item', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({
          version: 5,
          state: {
            characters: { a: { box: 1, totalSeen: 1, totalCorrect: 1, lastSeen: 1, reviewScore: 4 } },
          },
        }),
      )

      await useProgressStore.persist.rehydrate()

      expect(useProgressStore.getState().characters['a']).toMatchObject({ reviewActive: false, reviewStreak: 0 })
    })
  })

  // v6 -> v7: adds rowActivityCompletion (Recommended Path). Existing users
  // start with none completed for any row — the same as a fresh install.
  describe('v6 -> v7 rowActivityCompletion migration', () => {
    it('backfills an empty rowActivityCompletion map for a pre-v7 persisted state', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({ version: 6, state: { taughtRowIds: ['a-row'] } }),
      )

      await useProgressStore.persist.rehydrate()

      const state = useProgressStore.getState()
      expect(state.rowActivityCompletion).toEqual({})
      expect(state.taughtRowIds).toEqual(['a-row'])
    })
  })

  // Issue #13: がくせい/せんせい/いもうと moved from hiragana rows to chōon
  // rows, changing their word ids. Existing per-word Review state must
  // survive under the new id, not be silently dropped.
  describe('v7 -> v8 word-id rename migration (Issue #13)', () => {
    it('remaps existing Review state for the 3 renamed words to their new ids', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({
          version: 7,
          state: {
            words: {
              'sa-gakusei': { reviewActive: true, reviewStreak: 1 },
              'wa-sensei': { reviewActive: false, reviewStreak: 2 },
              'ma-imouto': { reviewActive: true, reviewStreak: 0 },
              'a-ai': { reviewActive: false, reviewStreak: 0 },
            },
          },
        }),
      )

      await useProgressStore.persist.rehydrate()

      const state = useProgressStore.getState()
      expect(state.words['chouon-e-gakusei']).toMatchObject({ reviewActive: true, reviewStreak: 1 })
      expect(state.words['chouon-e-sensei']).toMatchObject({ reviewActive: false, reviewStreak: 0 })
      expect(state.words['chouon-o-imouto']).toMatchObject({ reviewActive: true, reviewStreak: 0 })
      expect(state.words['sa-gakusei']).toBeUndefined()
      expect(state.words['wa-sensei']).toBeUndefined()
      expect(state.words['ma-imouto']).toBeUndefined()
      // Unrelated word state is untouched.
      expect(state.words['a-ai']).toMatchObject({ reviewActive: false, reviewStreak: 0 })
    })

    it('is a no-op when none of the renamed words have any persisted state', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({ version: 7, state: { words: { 'a-ai': { reviewActive: true, reviewStreak: 1 } } } }),
      )

      await useProgressStore.persist.rehydrate()

      const state = useProgressStore.getState()
      expect(state.words['a-ai']).toMatchObject({ reviewActive: true, reviewStreak: 1 })
      expect(Object.keys(state.words)).toEqual(['a-ai'])
    })
  })

  // Issue #19: the old session-wide, WordBuilder-only `showRomaji` (default
  // ON) is replaced by `alwaysShowRomajiHints` (a different setting, default
  // OFF) — its value is intentionally NOT carried forward.
  describe('v8 -> v9 alwaysShowRomajiHints migration (Issue #19)', () => {
    it('defaults alwaysShowRomajiHints to OFF for an existing user, regardless of their old showRomaji value', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({ version: 8, state: { showRomaji: true, taughtRowIds: ['a-row'] } }),
      )

      await useProgressStore.persist.rehydrate()

      const state = useProgressStore.getState()
      expect(state.alwaysShowRomajiHints).toBe(false)
      expect(state.taughtRowIds).toEqual(['a-row'])
    })

    it('does not lose other persisted data (Review/completion) during the migration', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({
          version: 8,
          state: {
            showRomaji: true,
            rowActivityCompletion: { 'a-row': { kanaQuiz: true } },
            words: { 'a-ai': { reviewActive: true, reviewStreak: 1 } },
          },
        }),
      )

      await useProgressStore.persist.rehydrate()

      const state = useProgressStore.getState()
      expect(state.rowActivityCompletion['a-row']).toEqual({ kanaQuiz: true })
      expect(state.words['a-ai']).toMatchObject({ reviewActive: true, reviewStreak: 1 })
    })
  })

  describe('alwaysShowRomajiHints setting (Issue #19)', () => {
    it('defaults to OFF for a fresh install', () => {
      expect(useProgressStore.getState().alwaysShowRomajiHints).toBe(false)
    })

    it('setAlwaysShowRomajiHints updates the flag and persists it across rehydrate', async () => {
      useProgressStore.getState().setAlwaysShowRomajiHints(true)
      expect(useProgressStore.getState().alwaysShowRomajiHints).toBe(true)

      await useProgressStore.persist.rehydrate()

      expect(useProgressStore.getState().alwaysShowRomajiHints).toBe(true)
    })
  })

  // Issue #23: Home's Continue card — pure navigation bookkeeping, no
  // history for a fresh install/existing pre-migration user.
  describe('v9 -> v10 lastStudied migration (Issue #23)', () => {
    it('defaults lastStudied to null for an existing user with no prior equivalent', async () => {
      localStorage.setItem('kana-game-progress', JSON.stringify({ version: 9, state: { taughtRowIds: ['a-row'] } }))

      await useProgressStore.persist.rehydrate()

      const state = useProgressStore.getState()
      expect(state.lastStudied).toBeNull()
      expect(state.taughtRowIds).toEqual(['a-row'])
    })

    it('does not lose other persisted data during the migration', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({
          version: 9,
          state: {
            rowActivityCompletion: { 'a-row': { kanaQuiz: true } },
            words: { 'a-ai': { reviewActive: true, reviewStreak: 1 } },
          },
        }),
      )

      await useProgressStore.persist.rehydrate()

      const state = useProgressStore.getState()
      expect(state.rowActivityCompletion['a-row']).toEqual({ kanaQuiz: true })
      expect(state.words['a-ai']).toMatchObject({ reviewActive: true, reviewStreak: 1 })
    })
  })

  describe('lastStudied (Issue #23)', () => {
    it('defaults to null for a fresh install', () => {
      expect(useProgressStore.getState().lastStudied).toBeNull()
    })

    it('setLastStudied updates the field and persists it across rehydrate', async () => {
      useProgressStore.getState().setLastStudied({ categoryId: 'hiragana', rowId: 'a-row', activity: 'kanaQuiz' })
      expect(useProgressStore.getState().lastStudied).toEqual({ categoryId: 'hiragana', rowId: 'a-row', activity: 'kanaQuiz' })

      await useProgressStore.persist.rehydrate()

      expect(useProgressStore.getState().lastStudied).toEqual({ categoryId: 'hiragana', rowId: 'a-row', activity: 'kanaQuiz' })
    })

    it('setLastStudied does not touch Recommended Path/completion/Review/SRS/mastery state', () => {
      useProgressStore.getState().setLastStudied({ categoryId: 'hiragana', rowId: 'a-row', activity: 'learn' })
      const state = useProgressStore.getState()
      expect(state.rowActivityCompletion).toEqual({})
      expect(state.taughtRowIds).toEqual([])
      expect(state.characters).toEqual({})
      expect(state.words).toEqual({})
    })

    it('a persisted lastStudied pointing at a nonexistent row is dropped rather than surfaced', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({ version: 10, state: { lastStudied: { categoryId: 'hiragana', rowId: 'not-a-real-row', activity: 'learn' } } }),
      )

      await useProgressStore.persist.rehydrate()

      expect(useProgressStore.getState().lastStudied).toBeNull()
    })

    it('a persisted lastStudied pointing at a summary row is dropped rather than surfaced', async () => {
      localStorage.setItem(
        'kana-game-progress',
        JSON.stringify({
          version: 10,
          state: { lastStudied: { categoryId: 'hiragana', rowId: 'hiragana-summary', activity: 'learn' } },
        }),
      )

      await useProgressStore.persist.rehydrate()

      expect(useProgressStore.getState().lastStudied).toBeNull()
    })
  })

  describe('Recommended Path completion (rowActivityCompletion)', () => {
    it('markRowActivityCompleted sets exactly the one flag for that row, leaving others false', () => {
      useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
      expect(useProgressStore.getState().isRowActivityCompleted('ka-row', 'kanaQuiz')).toBe(true)
      expect(useProgressStore.getState().isRowActivityCompleted('ka-row', 'listening')).toBe(false)
      expect(useProgressStore.getState().isRowActivityCompleted('ka-row', 'wordBuilder')).toBe(false)
      expect(useProgressStore.getState().isRowActivityCompleted('ka-row', 'tracing')).toBe(false)
    })

    it('is independent per row', () => {
      useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
      expect(useProgressStore.getState().isRowActivityCompleted('sa-row', 'kanaQuiz')).toBe(false)
    })

    it('accumulates multiple activities for the same row without clobbering earlier ones', () => {
      useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
      useProgressStore.getState().markRowActivityCompleted('ka-row', 'listening')
      expect(useProgressStore.getState().isRowActivityCompleted('ka-row', 'kanaQuiz')).toBe(true)
      expect(useProgressStore.getState().isRowActivityCompleted('ka-row', 'listening')).toBe(true)
    })

    it('persists across store rehydration', async () => {
      useProgressStore.getState().markRowActivityCompleted('ka-row', 'wordBuilder')
      // Simulate a reload: rehydrate from whatever the persist middleware
      // already wrote to localStorage on the set() above.
      await useProgressStore.persist.rehydrate()
      expect(useProgressStore.getState().isRowActivityCompleted('ka-row', 'wordBuilder')).toBe(true)
    })

    it('resetProgress clears all row activity completion', () => {
      useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
      useProgressStore.getState().resetProgress()
      expect(useProgressStore.getState().rowActivityCompletion).toEqual({})
    })
  })

  // Row mastery is a separate, already-existing dynamic concept (NOT this
  // issue's completion tracking) — box-4-for-every-character, recomputed
  // live rather than a stored flag. These lock in that it stays dynamic.
  describe('isRowMastered stays dynamic (unrelated to Recommended Path completion)', () => {
    it('is true once every character in the row reaches box 4', () => {
      useProgressStore.getState().markRowTaught('a-row')
      for (const id of ['a', 'i', 'u', 'e', 'o']) {
        for (let i = 0; i < 4; i++) useProgressStore.getState().recordResult(id, true)
      }
      expect(useProgressStore.getState().characters['a'].box).toBe(4)
      expect(useProgressStore.getState().isRowMastered('a-row')).toBe(true)
    })

    it('drops back to false the moment a single character falls below box 4', () => {
      useProgressStore.getState().markRowTaught('a-row')
      for (const id of ['a', 'i', 'u', 'e', 'o']) {
        for (let i = 0; i < 4; i++) useProgressStore.getState().recordResult(id, true)
      }
      expect(useProgressStore.getState().isRowMastered('a-row')).toBe(true)

      useProgressStore.getState().recordResult('a', false) // box 4 -> 3
      expect(useProgressStore.getState().characters['a'].box).toBe(3)
      expect(useProgressStore.getState().isRowMastered('a-row')).toBe(false)
    })

    it('becomes true again once every character is back at box 4', () => {
      useProgressStore.getState().markRowTaught('a-row')
      for (const id of ['a', 'i', 'u', 'e', 'o']) {
        for (let i = 0; i < 4; i++) useProgressStore.getState().recordResult(id, true)
      }
      useProgressStore.getState().recordResult('a', false) // box 4 -> 3
      expect(useProgressStore.getState().isRowMastered('a-row')).toBe(false)

      useProgressStore.getState().recordResult('a', true) // box 3 -> 4
      expect(useProgressStore.getState().isRowMastered('a-row')).toBe(true)
    })
  })
})
