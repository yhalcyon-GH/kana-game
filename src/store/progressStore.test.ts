import { beforeEach, describe, expect, it } from 'vitest'
import { mergePersistedProgress, useProgressStore } from './progressStore'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

describe('progressStore', () => {
  it('backfills missing v5 maps and reviewScore values during hydration', () => {
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

    expect(merged.characters.a.reviewScore).toBe(0)
    expect(merged.words).toEqual({})
    expect(merged.unlockedRowIds).toEqual(['a-row'])
    expect(typeof merged.recordResult).toBe('function')
  })

  it('normalizes invalid review scores before future arithmetic', () => {
    const current = useProgressStore.getState()
    const merged = mergePersistedProgress(
      { characters: { a: { box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0, reviewScore: Number.NaN } } },
      current,
    )

    expect(merged.characters.a.reviewScore).toBe(0)
  })

  it('hydrates a current-version partial storage envelope with default maps and actions intact', async () => {
    localStorage.setItem(
      'kana-game-progress',
      JSON.stringify({ version: 5, state: { characters: {}, taughtRowIds: ['a-row'] } }),
    )

    await useProgressStore.persist.rehydrate()

    const state = useProgressStore.getState()
    expect(state.words).toEqual({})
    expect(state.taughtRowIds).toEqual(['a-row'])
    expect(typeof state.recordResult).toBe('function')
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

  describe('adjustCharacterReviewScore', () => {
    it('accumulates and clamps to [0, 10]', () => {
      const { adjustCharacterReviewScore } = useProgressStore.getState()
      adjustCharacterReviewScore('a', 5)
      expect(useProgressStore.getState().characters['a'].reviewScore).toBe(5)
      adjustCharacterReviewScore('a', 5)
      expect(useProgressStore.getState().characters['a'].reviewScore).toBe(10)
      adjustCharacterReviewScore('a', 5) // would be 15, clamped to 10
      expect(useProgressStore.getState().characters['a'].reviewScore).toBe(10)
      adjustCharacterReviewScore('a', -100) // would be negative, clamped to 0
      expect(useProgressStore.getState().characters['a'].reviewScore).toBe(0)
    })

    it('initializes a not-yet-seen character rather than throwing', () => {
      useProgressStore.getState().adjustCharacterReviewScore('unseen-char', 3)
      expect(useProgressStore.getState().characters['unseen-char'].reviewScore).toBe(3)
    })
  })

  describe('adjustWordReviewScore', () => {
    it('accumulates and clamps to [0, 10], initializing a not-yet-seen word', () => {
      const { adjustWordReviewScore } = useProgressStore.getState()
      adjustWordReviewScore('a-ai', 10)
      expect(useProgressStore.getState().words['a-ai'].reviewScore).toBe(10)
      adjustWordReviewScore('a-ai', -5)
      expect(useProgressStore.getState().words['a-ai'].reviewScore).toBe(5)
      adjustWordReviewScore('a-ai', -100)
      expect(useProgressStore.getState().words['a-ai'].reviewScore).toBe(0)
    })
  })
})
