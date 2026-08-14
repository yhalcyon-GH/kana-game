import { afterEach, describe, expect, it, vi } from 'vitest'
import { NEAR_MISS_ONLY_ID } from '../data/feedback'
import { pickCorrectFeedback, pickEvaluationFeedback, pickIncorrectFeedback } from './feedbackVoice'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pickCorrectFeedback', () => {
  it('says せいかい on a plain streak (not 3 or 5)', () => {
    expect(pickCorrectFeedback(1).id).toBe('seikai')
    expect(pickCorrectFeedback(2).id).toBe('seikai')
    expect(pickCorrectFeedback(4).id).toBe('seikai')
    expect(pickCorrectFeedback(6).id).toBe('seikai')
  })

  it('says すごい exactly at streak 3', () => {
    expect(pickCorrectFeedback(3).id).toBe('sugoi')
  })

  it('says さいこう at streak 5 in the common case', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // well above the rare-line chance
    expect(pickCorrectFeedback(5).id).toBe('saikou')
  })

  it('can say かっこいい at streak 5 on the rare roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // below any positive chance threshold
    expect(pickCorrectFeedback(5).id).toBe('kakkoii')
  })
})

describe('pickIncorrectFeedback', () => {
  it('never picks おしい when the answer was not a near miss', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickIncorrectFeedback(false).id).not.toBe(NEAR_MISS_ONLY_ID)
    }
  })

  it('can pick おしい when the answer was a near miss', () => {
    const ids = new Set(Array.from({ length: 50 }, () => pickIncorrectFeedback(true).id))
    expect(ids.has(NEAR_MISS_ONLY_ID)).toBe(true)
  })
})

describe('pickEvaluationFeedback', () => {
  it('says かんぺき for a flawless session', () => {
    expect(pickEvaluationFeedback(0).id).toBe('kanpeki')
  })

  it('says おしい for 1-2 mistakes', () => {
    expect(pickEvaluationFeedback(1).id).toBe('oshii')
    expect(pickEvaluationFeedback(2).id).toBe('oshii')
  })

  it('says ドンマイ for 3 or more mistakes', () => {
    expect(pickEvaluationFeedback(3).id).toBe('donmai')
    expect(pickEvaluationFeedback(10).id).toBe('donmai')
  })
})
