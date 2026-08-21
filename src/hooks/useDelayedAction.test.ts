import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDelayedAction } from './useDelayedAction'

describe('useDelayedAction', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('cancels a scheduled action on unmount', () => {
    vi.useFakeTimers()
    const action = vi.fn()
    const { result, unmount } = renderHook(() => useDelayedAction())

    act(() => result.current.schedule(action, 2000))
    unmount()
    act(() => vi.advanceTimersByTime(2000))

    expect(action).not.toHaveBeenCalled()
  })

  it('replaces an older scheduled action', () => {
    vi.useFakeTimers()
    const oldAction = vi.fn()
    const currentAction = vi.fn()
    const { result } = renderHook(() => useDelayedAction())

    act(() => {
      result.current.schedule(oldAction, 2000)
      result.current.schedule(currentAction, 2000)
    })
    act(() => vi.advanceTimersByTime(2000))

    expect(oldAction).not.toHaveBeenCalled()
    expect(currentAction).toHaveBeenCalledTimes(1)
  })
})
