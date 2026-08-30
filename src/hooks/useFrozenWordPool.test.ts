import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AnchorWord } from '../data/types'
import { useFrozenWordPool } from './useFrozenWordPool'

function word(id: string): AnchorWord {
  return { id, kana: id, romaji: id, meaning: id, characterIds: [] }
}

describe('useFrozenWordPool', () => {
  it('resolves every word passed in for the current session key', () => {
    const { result } = renderHook(() => useFrozenWordPool('a-row', [word('a-ai'), word('a-ie')]))
    expect(result.current.wordIds).toEqual(['a-ai', 'a-ie'])
    expect(result.current.wordsById['a-ai']?.id).toBe('a-ai')
  })

  // Regression: Review's live word pool (see useCurriculum's mistake-driven
  // weak-word selection) can shrink mid-session as the learner answers — a
  // resolver that just mirrors the live pool would stop resolving an
  // already-queued id the moment it drops out, even though the session
  // itself hasn't restarted (same sessionKey).
  it('keeps resolving a word that drops out of the live pool, as long as sessionKey has not changed', () => {
    const { result, rerender } = renderHook(({ words }: { words: AnchorWord[] }) => useFrozenWordPool('review', words), {
      initialProps: { words: [word('a-ai'), word('a-ie')] },
    })
    expect(result.current.wordsById['a-ai']).toBeDefined()

    // Simulate the live pool shrinking after a correct answer removes 'a-ai'.
    rerender({ words: [word('a-ie')] })

    expect(result.current.wordsById['a-ai']).toBeDefined()
    expect(result.current.wordIds).toEqual(['a-ai', 'a-ie'])
  })

  it('re-freezes on the next words snapshot once sessionKey changes', () => {
    const { result, rerender } = renderHook(
      ({ key, words }: { key: string; words: AnchorWord[] }) => useFrozenWordPool(key, words),
      { initialProps: { key: 'a-row', words: [word('a-ai')] } },
    )
    expect(result.current.wordIds).toEqual(['a-ai'])

    act(() => {
      rerender({ key: 'ka-row', words: [word('ka-aka')] })
    })

    expect(result.current.wordIds).toEqual(['ka-aka'])
    expect(result.current.wordsById['a-ai']).toBeUndefined()
  })

  it('captures the current live Review words when a new attempt starts for the same row', () => {
    const { result, rerender } = renderHook(
      ({ attempt, words }: { attempt: number; words: AnchorWord[] }) =>
        useFrozenWordPool(`review:${attempt}`, words),
      { initialProps: { attempt: 0, words: [word('a-ai'), word('a-ie')] } },
    )

    rerender({ attempt: 0, words: [word('a-ie')] })
    expect(result.current.wordIds).toEqual(['a-ai', 'a-ie'])

    rerender({ attempt: 1, words: [word('a-ie')] })
    expect(result.current.wordIds).toEqual(['a-ie'])
    expect(result.current.wordsById['a-ai']).toBeUndefined()
  })
})
