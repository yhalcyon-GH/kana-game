import { describe, expect, it } from 'vitest'
import { PRACTICE_RESULT_IMAGES, pickPracticeResultImage } from './practiceResultImage'

describe('pickPracticeResultImage', () => {
  it('picks image 1 for accuracy below 25%', () => {
    expect(pickPracticeResultImage({ correct: 0, total: 8 })).toBe(PRACTICE_RESULT_IMAGES[0])
    expect(pickPracticeResultImage({ correct: 1, total: 8 })).toBe(PRACTICE_RESULT_IMAGES[0]) // 12.5%
  })

  it('picks image 2 for 25% <= accuracy < 50%', () => {
    expect(pickPracticeResultImage({ correct: 2, total: 8 })).toBe(PRACTICE_RESULT_IMAGES[1]) // exactly 25%
    expect(pickPracticeResultImage({ correct: 3, total: 8 })).toBe(PRACTICE_RESULT_IMAGES[1]) // 37.5%
  })

  it('picks image 3 for 50% <= accuracy < 75%', () => {
    expect(pickPracticeResultImage({ correct: 4, total: 8 })).toBe(PRACTICE_RESULT_IMAGES[2]) // exactly 50%
    expect(pickPracticeResultImage({ correct: 5, total: 8 })).toBe(PRACTICE_RESULT_IMAGES[2]) // 62.5%
  })

  it('picks image 4 for 75% <= accuracy < 100%', () => {
    expect(pickPracticeResultImage({ correct: 6, total: 8 })).toBe(PRACTICE_RESULT_IMAGES[3]) // exactly 75%
    expect(pickPracticeResultImage({ correct: 7, total: 8 })).toBe(PRACTICE_RESULT_IMAGES[3]) // 87.5%
  })

  it('picks image 5 only for a perfect (100%) score', () => {
    expect(pickPracticeResultImage({ correct: 8, total: 8 })).toBe(PRACTICE_RESULT_IMAGES[4])
  })

  it('works for a shorter Retry/Review session (e.g. total 3 or 1)', () => {
    expect(pickPracticeResultImage({ correct: 1, total: 1 })).toBe(PRACTICE_RESULT_IMAGES[4]) // 100%
    expect(pickPracticeResultImage({ correct: 0, total: 1 })).toBe(PRACTICE_RESULT_IMAGES[0]) // 0%
    expect(pickPracticeResultImage({ correct: 2, total: 3 })).toBe(PRACTICE_RESULT_IMAGES[2]) // 66.7%
  })

  it('works for a 15-question session', () => {
    expect(pickPracticeResultImage({ correct: 15, total: 15 })).toBe(PRACTICE_RESULT_IMAGES[4])
    expect(pickPracticeResultImage({ correct: 12, total: 15 })).toBe(PRACTICE_RESULT_IMAGES[3]) // 80%
    expect(pickPracticeResultImage({ correct: 11, total: 15 })).toBe(PRACTICE_RESULT_IMAGES[2]) // 73.3%
  })
})
