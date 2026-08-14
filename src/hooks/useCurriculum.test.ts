import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProgressStore } from '../store/progressStore'
import { REVIEW_SCOPE_ID, useCurriculum } from './useCurriculum'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

describe('useCurriculum', () => {
  it('isScopeReady is true for any real row regardless of taught/unlocked status', () => {
    const { result } = renderHook(() => useCurriculum())
    expect(result.current.isScopeReady('ka-row')).toBe(true)
  })

  it('isScopeReady is false for the review scope until at least one row is taught', () => {
    const { result: before } = renderHook(() => useCurriculum())
    expect(before.current.isScopeReady(REVIEW_SCOPE_ID)).toBe(false)

    useProgressStore.getState().markRowTaught('a-row')
    const { result: after } = renderHook(() => useCurriculum())
    expect(after.current.isScopeReady(REVIEW_SCOPE_ID)).toBe(true)
  })

  it('getScopeWords returns a real row\'s own word list', () => {
    const { result } = renderHook(() => useCurriculum())
    const words = result.current.getScopeWords('a-row')
    expect(words.length).toBeGreaterThan(0)
    expect(words.every((w) => w.characterIds.every((c) => ['a', 'i', 'u', 'e', 'o'].includes(c)))).toBe(true)
  })

  it('getScopeCharacterIds returns the cumulative pool (including earlier rows) for a real row', () => {
    const { result } = renderHook(() => useCurriculum())
    const ids = result.current.getScopeCharacterIds('ka-row')
    // ka-row's own characters plus every a-row character introduced before it.
    expect(ids).toEqual(expect.arrayContaining(['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko']))
  })

  it('getScopeQuizCharacterIds returns only a real row\'s own new characters, not the cumulative pool', () => {
    const { result } = renderHook(() => useCurriculum())
    const ids = result.current.getScopeQuizCharacterIds('ka-row')
    expect(ids.every((id) => !['a', 'i', 'u', 'e', 'o'].includes(id))).toBe(true)
  })

  it('the review scope mixes every taught row\'s words, falling back to all taught words when nothing is due', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { result } = renderHook(() => useCurriculum())
    // Freshly taught characters start at box 0, which is always due, so
    // every taught word should come back (nothing to fall back from yet).
    const reviewWords = result.current.getScopeWords(REVIEW_SCOPE_ID)
    const aWords = result.current.getScopeWords('a-row')
    const kaWords = result.current.getScopeWords('ka-row')
    expect(reviewWords.length).toBe(aWords.length + kaWords.length)
  })

  it('unknown/undefined scope ids return empty results rather than throwing', () => {
    const { result } = renderHook(() => useCurriculum())
    expect(result.current.getScopeWords(undefined)).toEqual([])
    expect(result.current.getScopeCharacterIds('not-a-real-row')).toEqual([])
    expect(result.current.isScopeReady(undefined)).toBe(false)
  })
})
