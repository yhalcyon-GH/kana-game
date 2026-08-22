import { describe, expect, it } from 'vitest'
import { applyReviewResult, MAX_BOX, meetsAdvanceThreshold, MIN_BOX, nextBox, REVIEW_STREAK_TARGET, weightForBox } from './srs'

describe('nextBox', () => {
  it('increments on correct, clamped at MAX_BOX', () => {
    expect(nextBox(0, true)).toBe(1)
    expect(nextBox(MAX_BOX, true)).toBe(MAX_BOX)
  })

  it('decrements by one on incorrect, clamped at MIN_BOX', () => {
    expect(nextBox(2, false)).toBe(1)
    expect(nextBox(MIN_BOX, false)).toBe(MIN_BOX)
  })
})

describe('weightForBox', () => {
  it('assigns strictly higher weight to lower boxes', () => {
    expect(weightForBox(0)).toBeGreaterThan(weightForBox(1))
    expect(weightForBox(1)).toBeGreaterThan(weightForBox(2))
    expect(weightForBox(2)).toBeGreaterThan(weightForBox(3))
    expect(weightForBox(3)).toBeGreaterThan(weightForBox(4))
  })
})

describe('meetsAdvanceThreshold', () => {
  it('fails with too few attempts even at high accuracy', () => {
    expect(meetsAdvanceThreshold({ box: 3, totalSeen: 2, totalCorrect: 2 })).toBe(false)
  })

  it('fails below box 2', () => {
    expect(meetsAdvanceThreshold({ box: 1, totalSeen: 5, totalCorrect: 5 })).toBe(false)
  })

  it('fails below 70% accuracy', () => {
    expect(meetsAdvanceThreshold({ box: 2, totalSeen: 10, totalCorrect: 6 })).toBe(false)
  })

  it('passes with box>=2, >=3 attempts, >=70% accuracy', () => {
    expect(meetsAdvanceThreshold({ box: 2, totalSeen: 10, totalCorrect: 7 })).toBe(true)
    expect(meetsAdvanceThreshold({ box: 4, totalSeen: 3, totalCorrect: 3 })).toBe(true)
  })
})

describe('applyReviewResult', () => {
  it('a miss activates Review and resets the streak to 0, regardless of prior state', () => {
    expect(applyReviewResult({ reviewActive: false, reviewStreak: 0 }, false)).toEqual({
      reviewActive: true,
      reviewStreak: 0,
    })
    expect(applyReviewResult({ reviewActive: true, reviewStreak: 1 }, false)).toEqual({
      reviewActive: true,
      reviewStreak: 0,
    })
  })

  it('a correct answer while inactive is a no-op', () => {
    const inactive = { reviewActive: false, reviewStreak: 0 }
    expect(applyReviewResult(inactive, true)).toEqual(inactive)
  })

  it('a correct answer while active increments the streak', () => {
    expect(applyReviewResult({ reviewActive: true, reviewStreak: 0 }, true)).toEqual({
      reviewActive: true,
      reviewStreak: 1,
    })
  })

  it('graduates (leaves Review, streak resets) once the streak reaches REVIEW_STREAK_TARGET', () => {
    expect(REVIEW_STREAK_TARGET).toBe(2)
    expect(applyReviewResult({ reviewActive: true, reviewStreak: 1 }, true)).toEqual({
      reviewActive: false,
      reviewStreak: 0,
    })
  })

  it('two consecutive correct answers from a fresh miss graduate the item', () => {
    let state = applyReviewResult({ reviewActive: false, reviewStreak: 0 }, false)
    state = applyReviewResult(state, true)
    expect(state).toEqual({ reviewActive: true, reviewStreak: 1 })
    state = applyReviewResult(state, true)
    expect(state).toEqual({ reviewActive: false, reviewStreak: 0 })
  })

  it('a miss at 1/2 resets to 0/2 instead of graduating or compounding', () => {
    const oneOfTwo = { reviewActive: true, reviewStreak: 1 }
    expect(applyReviewResult(oneOfTwo, false)).toEqual({ reviewActive: true, reviewStreak: 0 })
  })
})
