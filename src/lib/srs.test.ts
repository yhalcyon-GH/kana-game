import { describe, expect, it } from 'vitest'
import { MAX_BOX, MIN_BOX, clampReviewScore, meetsAdvanceThreshold, needsReview, nextBox, weightForBox } from './srs'

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

describe('clampReviewScore', () => {
  it('clamps to [0, 10]', () => {
    expect(clampReviewScore(-3)).toBe(0)
    expect(clampReviewScore(0)).toBe(0)
    expect(clampReviewScore(7)).toBe(7)
    expect(clampReviewScore(10)).toBe(10)
    expect(clampReviewScore(15)).toBe(10)
  })
})

describe('needsReview', () => {
  it('is false below the threshold (5) and true at or above it', () => {
    expect(needsReview(0)).toBe(false)
    expect(needsReview(4)).toBe(false)
    expect(needsReview(5)).toBe(true)
    expect(needsReview(10)).toBe(true)
  })

  // Regression: a score can jump straight past the threshold in one step
  // (e.g. a precise hit takes 5 -> 3), so this must be a live comparison
  // against the current value, never a one-off "did it just hit exactly 4"
  // event check.
  it('re-evaluates from the current score rather than watching for one exact value', () => {
    expect(needsReview(3)).toBe(false) // 5 - 2 = 3, straight past 4
  })
})
