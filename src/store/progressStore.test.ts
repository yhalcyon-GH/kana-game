import { beforeEach, describe, expect, it } from 'vitest'
import { useProgressStore } from './progressStore'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

describe('progressStore', () => {
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
})
