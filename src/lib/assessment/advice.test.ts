import { describe, expect, it } from 'vitest'
import { getAssessmentAdvice } from './advice'
import type { AssessmentFamilyScore, AssessmentResult } from './types'

const perfect: AssessmentFamilyScore = { correct: 5, total: 5 }
const weak: AssessmentFamilyScore = { correct: 1, total: 5 }
const zero: AssessmentFamilyScore = { correct: 0, total: 0 }

function result(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    script: 'hiragana',
    correct: 20,
    total: 20,
    percent: 100,
    familyScores: { 'kana-quiz': perfect, listening: perfect, 'word-builder': perfect, 'word-reading': perfect },
    weakCharIds: [],
    weakWordIds: [],
    ...overrides,
  }
}

describe('getAssessmentAdvice', () => {
  it('recommends nothing when every family is strong', () => {
    expect(getAssessmentAdvice(result())).toEqual([])
  })

  it('recommends the Hiragana Kana Quiz route when kana-quiz is weak', () => {
    const advice = getAssessmentAdvice(result({ familyScores: { 'kana-quiz': weak, listening: perfect, 'word-builder': perfect, 'word-reading': perfect } }))
    expect(advice).toEqual([{ label: 'Hiragana Kana Quiz', to: '/practice/hiragana/hiragana-summary/kana-quiz', reason: 'kana-quiz' }])
  })

  it('recommends the Katakana Listening route when listening is weak, for the katakana script', () => {
    const advice = getAssessmentAdvice(
      result({ script: 'katakana', familyScores: { 'kana-quiz': perfect, listening: weak, 'word-builder': perfect, 'word-reading': perfect } }),
    )
    expect(advice).toEqual([{ label: 'Katakana Listening', to: '/practice/katakana/katakana-summary/listening', reason: 'listening' }])
  })

  it('recommends Restaurant Practice for weak Hiragana word-reading, Cafe Practice for weak Katakana', () => {
    const hiragana = getAssessmentAdvice(
      result({ familyScores: { 'kana-quiz': perfect, listening: perfect, 'word-builder': perfect, 'word-reading': weak } }),
    )
    expect(hiragana).toEqual([{ label: 'Restaurant Practice', to: '/restaurant/hiragana-complete', reason: 'word-reading' }])

    const katakana = getAssessmentAdvice(
      result({ script: 'katakana', familyScores: { 'kana-quiz': perfect, listening: perfect, 'word-builder': perfect, 'word-reading': weak } }),
    )
    expect(katakana).toEqual([{ label: 'Cafe Practice', to: '/cafe/katakana-ha-row', reason: 'word-reading' }])
  })

  it('never recommends more than 2 areas, prioritizing the weakest', () => {
    const veryWeak: AssessmentFamilyScore = { correct: 0, total: 5 }
    const advice = getAssessmentAdvice(
      result({ familyScores: { 'kana-quiz': weak, listening: veryWeak, 'word-builder': weak, 'word-reading': weak } }),
    )
    expect(advice).toHaveLength(2)
    expect(advice[0].reason).toBe('listening')
  })

  it('ignores a family with zero questions rather than treating it as weak', () => {
    const advice = getAssessmentAdvice(result({ familyScores: { 'kana-quiz': zero, listening: perfect, 'word-builder': perfect, 'word-reading': perfect } }))
    expect(advice).toEqual([])
  })

  it('gives Word Builder a slight priority edge among equally weak families', () => {
    const advice = getAssessmentAdvice(
      result({ familyScores: { 'kana-quiz': weak, listening: perfect, 'word-builder': weak, 'word-reading': perfect } }),
    )
    expect(advice[0].reason).toBe('word-builder')
  })
})
