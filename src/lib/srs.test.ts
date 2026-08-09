import { describe, expect, it } from 'vitest'
import { MAX_BOX, MIN_BOX, isDue, meetsAdvanceThreshold, nextBox, weightForBox } from './srs'

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

describe('isDue', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('box 0 is always due, regardless of how recently it was seen', () => {
    const now = Date.now()
    expect(isDue({ box: 0, lastSeen: now }, now)).toBe(true)
  })

  it('is not due before its box interval has elapsed', () => {
    const now = Date.now()
    expect(isDue({ box: 2, lastSeen: now - 1 * DAY }, now)).toBe(false)
  })

  it('is due once its box interval has elapsed', () => {
    const now = Date.now()
    expect(isDue({ box: 2, lastSeen: now - 3 * DAY }, now)).toBe(true)
  })

  it('gives higher boxes longer intervals than lower boxes', () => {
    const now = Date.now()
    const lastSeen = now - 5 * DAY
    expect(isDue({ box: 1, lastSeen }, now)).toBe(true)
    expect(isDue({ box: 4, lastSeen }, now)).toBe(false)
  })
})
