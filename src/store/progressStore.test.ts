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
})
