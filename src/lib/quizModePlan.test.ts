import { describe, expect, it, vi } from 'vitest'
import { buildQuizModePlan } from './quizModePlan'

describe('buildQuizModePlan', () => {
  it('splits an 8-question session exactly 4 Read / 4 Recall', () => {
    for (let i = 0; i < 20; i++) {
      const plan = buildQuizModePlan(8)
      expect(plan).toHaveLength(8)
      expect(plan.filter((m) => m === 'read')).toHaveLength(4)
      expect(plan.filter((m) => m === 'recall')).toHaveLength(4)
    }
  })

  it('is not always the same fixed order (shuffled)', () => {
    const orders = new Set(Array.from({ length: 30 }, () => buildQuizModePlan(8).join(',')))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('splits an odd count as evenly as possible, with one direction getting a single extra', () => {
    for (let i = 0; i < 20; i++) {
      const plan = buildQuizModePlan(5)
      expect(plan).toHaveLength(5)
      const readCount = plan.filter((m) => m === 'read').length
      const recallCount = plan.filter((m) => m === 'recall').length
      expect(new Set([readCount, recallCount])).toEqual(new Set([2, 3]))
    }
  })

  it('handles a single-question replay (one direction only)', () => {
    const plan = buildQuizModePlan(1)
    expect(plan).toHaveLength(1)
    expect(['read', 'recall']).toContain(plan[0])
  })

  it('handles zero questions', () => {
    expect(buildQuizModePlan(0)).toEqual([])
  })

  it('the odd leftover slot is randomized between Read and Recall, not fixed', () => {
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValue(0.9) // >= 0.5 -> 'recall' for the extra slot
    const highPlan = buildQuizModePlan(1)
    randomSpy.mockReturnValue(0.1) // < 0.5 -> 'read'
    const lowPlan = buildQuizModePlan(1)
    randomSpy.mockRestore()

    expect(highPlan).toEqual(['recall'])
    expect(lowPlan).toEqual(['read'])
  })
})
