import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickCorrectFeedback, pickIncorrectFeedback, pickResultFeedback } from './feedbackVoice'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pickCorrectFeedback', () => {
  it('picks from the normal correct pool on a non-milestone streak', () => {
    for (let i = 0; i < 50; i++) {
      expect(['correct_iine', 'correct_seikai', 'correct_sonochoushi']).toContain(pickCorrectFeedback(1, 8, null).id)
      expect(['correct_iine', 'correct_seikai', 'correct_sonochoushi']).toContain(pickCorrectFeedback(6, 15, null).id)
    }
  })

  it('never repeats the immediately-previous normal-correct pick', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickCorrectFeedback(1, 8, 'correct_iine').id).not.toBe('correct_iine')
    }
  })

  it('plays the streak-5 milestone, replacing the normal pool, in both modes', () => {
    expect(pickCorrectFeedback(5, 8, null).id).toBe('streak_5_sugoi')
    expect(pickCorrectFeedback(5, 15, null).id).toBe('streak_5_sugoi')
  })

  it('plays the streak-8 milestone in both modes', () => {
    expect(pickCorrectFeedback(8, 8, null).id).toBe('streak_8_kanpeki')
    expect(pickCorrectFeedback(8, 15, null).id).toBe('streak_8_kanpeki')
  })

  it('plays streak-10/15 milestones only in 15-question mode', () => {
    expect(pickCorrectFeedback(10, 15, null).id).toBe('streak_10_saikou')
    expect(pickCorrectFeedback(15, 15, null).id).toBe('streak_15_perfect')
    expect(pickCorrectFeedback(10, 8, null).id).not.toBe('streak_10_saikou')
    expect(pickCorrectFeedback(15, 8, null).id).not.toBe('streak_15_perfect')
  })
})

describe('pickIncorrectFeedback', () => {
  it('picks from the wrong-answer pool', () => {
    for (let i = 0; i < 50; i++) {
      expect(['wrong_oshii', 'wrong_ganbare', 'wrong_daijoubu']).toContain(pickIncorrectFeedback(null).id)
    }
  })

  it('never repeats the immediately-previous pick', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickIncorrectFeedback('wrong_oshii').id).not.toBe('wrong_oshii')
    }
  })
})

describe('pickResultFeedback', () => {
  it('always says かんぺき for a flawless session, in both modes (reusing the existing line)', () => {
    expect(pickResultFeedback(8, 8).id).toBe('kanpeki')
    expect(pickResultFeedback(15, 15).id).toBe('kanpeki')
  })

  it('says すごい at 80% or above (but below 100%), reusing the existing line', () => {
    expect(pickResultFeedback(7, 8).id).toBe('sugoi') // 87.5%
    expect(pickResultFeedback(12, 15).id).toBe('sugoi') // 80%
  })

  it('says その調子 at 60% up to (but excluding) 80%, reusing the per-answer-correct line', () => {
    expect(pickResultFeedback(6, 8).id).toBe('correct_sonochoushi') // 75%
    expect(pickResultFeedback(5, 8).id).toBe('correct_sonochoushi') // 62.5%
    expect(pickResultFeedback(9, 15).id).toBe('correct_sonochoushi') // 60%
  })

  it('says 頑張れ at 40% up to (but excluding) 60%, reusing the wrong-answer line', () => {
    expect(pickResultFeedback(4, 8).id).toBe('wrong_ganbare') // 50%
    expect(pickResultFeedback(6, 15).id).toBe('wrong_ganbare') // 40%
  })

  it('says ファイト below 40%', () => {
    expect(pickResultFeedback(3, 8).id).toBe('eval_faito') // 37.5%
    expect(pickResultFeedback(0, 15).id).toBe('eval_faito')
  })

  it('never rounds the accuracy before comparing', () => {
    // 6/8 = 75%, which must land in その調子 (60-80%), not すごい (80%+).
    expect(pickResultFeedback(6, 8).id).toBe('correct_sonochoushi')
  })
})
