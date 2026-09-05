import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as trackModule from '../lib/analytics/track'
import { usePracticeAnalytics } from './usePracticeAnalytics'

describe('usePracticeAnalytics', () => {
  beforeEach(() => {
    vi.spyOn(trackModule, 'track')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fires practice_started once for a given sessionKey', () => {
    const { rerender } = renderHook(
      ({ sessionKey }: { sessionKey: string }) => usePracticeAnalytics('kanaQuiz', 'hiragana', 'a-row', sessionKey, false, 0, 0),
      { initialProps: { sessionKey: 'a-row:0' } },
    )
    expect(trackModule.track).toHaveBeenCalledTimes(1)
    expect(trackModule.track).toHaveBeenCalledWith('practice_started', { activity: 'kanaQuiz', category: 'hiragana', row: 'a-row' })

    // Re-rendering with the SAME sessionKey must not re-fire (guards
    // against React StrictMode's dev-only double-invoke of effects).
    rerender({ sessionKey: 'a-row:0' })
    expect(trackModule.track).toHaveBeenCalledTimes(1)
  })

  it('fires practice_started again when sessionKey changes (e.g. Retry)', () => {
    const { rerender } = renderHook(
      ({ sessionKey }: { sessionKey: string }) => usePracticeAnalytics('kanaQuiz', 'hiragana', 'a-row', sessionKey, false, 0, 0),
      { initialProps: { sessionKey: 'a-row:0' } },
    )
    rerender({ sessionKey: 'a-row:1' })
    expect(trackModule.track).toHaveBeenCalledTimes(2)
    expect(trackModule.track).toHaveBeenLastCalledWith('practice_started', { activity: 'kanaQuiz', category: 'hiragana', row: 'a-row' })
  })

  it('fires practice_completed once when finished flips true, with score/questionCount', () => {
    const { rerender } = renderHook(
      ({ finished, correct }: { finished: boolean; correct: number }) =>
        usePracticeAnalytics('wordBuilder', 'hiragana', 'a-row', 'a-row:0', finished, correct, 8),
      { initialProps: { finished: false, correct: 0 } },
    )
    expect(trackModule.track).not.toHaveBeenCalledWith('practice_completed', expect.anything())

    rerender({ finished: true, correct: 6 })
    expect(trackModule.track).toHaveBeenCalledWith('practice_completed', {
      activity: 'wordBuilder',
      category: 'hiragana',
      row: 'a-row',
      score: 6,
      questionCount: 8,
    })

    // Re-rendering with finished still true must not re-fire.
    const completedCallCount = (trackModule.track as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'practice_completed').length
    rerender({ finished: true, correct: 6 })
    const completedCallCountAfter = (trackModule.track as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'practice_completed').length
    expect(completedCallCountAfter).toBe(completedCallCount)
  })

  it('does not fire practice_completed when questionCount is 0 (empty/unready scope)', () => {
    renderHook(() => usePracticeAnalytics('listening', 'hiragana', 'a-row', 'a-row:0', true, 0, 0))
    expect(trackModule.track).not.toHaveBeenCalledWith('practice_completed', expect.anything())
  })
})
