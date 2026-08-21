import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameSession } from './useGameSession'

describe('useGameSession', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports the completed queue length once', () => {
    const onFinish = vi.fn()
    const { result } = renderHook(() =>
      useGameSession({
        ids: ['a', 'i'],
        weight: () => 0,
        onFinish,
        resetSession: vi.fn(),
        rounds: 2,
        sessionKey: 'a-row',
      }),
    )

    act(() => result.current.setCorrectCount(1))
    act(() => {
      result.current.advance()
      result.current.advance()
    })

    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenCalledWith(1, 2)
  })

  it('uses the mistake queue length for the retry accuracy denominator', () => {
    const onFinish = vi.fn()
    const { result } = renderHook(() =>
      useGameSession({
        ids: ['a', 'i', 'u'],
        weight: () => 0,
        onFinish,
        resetSession: vi.fn(),
        rounds: 3,
        sessionKey: 'a-row',
      }),
    )

    act(() => result.current.startMistakeReview(['i']))
    act(() => result.current.setCorrectCount(1))
    act(() => result.current.advance())

    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenLastCalledWith(1, 1)
  })

  it('keeps a running queue stable but uses current ids for explicit replay', () => {
    const callbacks = { weight: () => 0, onFinish: vi.fn(), resetSession: vi.fn() }
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useGameSession({ ids, ...callbacks, rounds: 2, sessionKey: 'review' }),
      { initialProps: { ids: ['a', 'i'] } },
    )
    expect(result.current.queue).toEqual(expect.arrayContaining(['a', 'i']))

    rerender({ ids: ['u'] })
    expect(result.current.queue).toEqual(expect.arrayContaining(['a', 'i']))

    act(() => result.current.startSession())
    expect(result.current.queue).toEqual(['u', 'u'])
  })
})
