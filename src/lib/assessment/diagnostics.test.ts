import { describe, expect, it } from 'vitest'
import { scoreAssessment } from './diagnostics'
import type { AssessmentAnswer } from './types'

function answer(overrides: Partial<AssessmentAnswer> & Pick<AssessmentAnswer, 'family' | 'correct'>): AssessmentAnswer {
  return { questionId: `${overrides.family}-x`, coveredCharIds: [], ...overrides }
}

describe('scoreAssessment', () => {
  it('computes overall correct/total/percent', () => {
    const answers: AssessmentAnswer[] = [
      answer({ family: 'kana-quiz', correct: true }),
      answer({ family: 'kana-quiz', correct: false }),
      answer({ family: 'listening', correct: true }),
      answer({ family: 'listening', correct: true }),
    ]
    const result = scoreAssessment('hiragana', answers)
    expect(result.correct).toBe(3)
    expect(result.total).toBe(4)
    expect(result.percent).toBe(75)
    expect(result.script).toBe('hiragana')
  })

  it('produces all four family subscores, even for families with zero questions', () => {
    const result = scoreAssessment('hiragana', [answer({ family: 'kana-quiz', correct: true })])
    expect(result.familyScores).toEqual({
      'kana-quiz': { correct: 1, total: 1 },
      listening: { correct: 0, total: 0 },
      'word-builder': { correct: 0, total: 0 },
      'word-reading': { correct: 0, total: 0 },
    })
  })

  it('derives weak character ids only from wrong answers', () => {
    const result = scoreAssessment('hiragana', [
      answer({ family: 'kana-quiz', correct: true, coveredCharIds: ['a'] }),
      answer({ family: 'kana-quiz', correct: false, coveredCharIds: ['ka'] }),
      answer({ family: 'listening', correct: false, coveredCharIds: ['sa', 'shi'] }),
    ])
    expect(result.weakCharIds.sort()).toEqual(['ka', 'sa', 'shi'])
  })

  it('derives weak word ids only from wrong word-based answers', () => {
    const result = scoreAssessment('hiragana', [
      answer({ family: 'listening', correct: true, targetWordId: 'a-ai' }),
      answer({ family: 'word-builder', correct: false, targetWordId: 'ka-aka' }),
      answer({ family: 'word-reading', correct: false, targetWordId: 'ka-ika' }),
      answer({ family: 'kana-quiz', correct: false }),
    ])
    expect(result.weakWordIds.sort()).toEqual(['ka-aka', 'ka-ika'])
  })

  it('is 0/0/0% for an empty answer set', () => {
    const result = scoreAssessment('katakana', [])
    expect(result).toMatchObject({ correct: 0, total: 0, percent: 0, weakCharIds: [], weakWordIds: [] })
  })
})
