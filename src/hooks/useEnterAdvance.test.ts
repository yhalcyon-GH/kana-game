import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEnterAdvance } from './useEnterAdvance'

function pressEnter(repeat: boolean) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat }))
}

describe('useEnterAdvance', () => {
  it('calls onAdvance for a single Enter press', () => {
    const onAdvance = vi.fn()
    renderHook(() => useEnterAdvance(true, onAdvance))

    pressEnter(false)

    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  // Regression: holding Enter down triggers OS key-repeat, which fires a
  // stream of keydown events (each with `repeat: true`) for as long as the
  // key stays down. useGameSession's advance() has no per-round guard, so
  // each of those synthetic repeats used to skip a round without it ever
  // being answered.
  it('ignores OS key-repeat keydown events (repeat: true) so holding Enter does not skip multiple rounds', () => {
    const onAdvance = vi.fn()
    renderHook(() => useEnterAdvance(true, onAdvance))

    pressEnter(false)
    pressEnter(true)
    pressEnter(true)
    pressEnter(true)

    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('does nothing while disabled', () => {
    const onAdvance = vi.fn()
    renderHook(() => useEnterAdvance(false, onAdvance))

    pressEnter(false)

    expect(onAdvance).not.toHaveBeenCalled()
  })
})
