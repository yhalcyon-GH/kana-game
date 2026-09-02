import { describe, expect, it } from 'vitest'
import type { AnchorWord } from '../data/types'
import type { AssessmentQuestion } from './assessmentPlan'
import { computeAssessmentResults, getPracticeRecommendations, type AssessmentAnswer } from './assessmentResults'

const WORD: AnchorWord = { id: 'w1', kana: 'さかな', romaji: 'sakana', meaning: 'fish', characterIds: ['sa', 'ka', 'na'] }

function q(family: AssessmentQuestion['family'], overrides: Partial<AssessmentQuestion> = {}): AssessmentQuestion {
  const direction =
    family === 'word-reading' ? 'kana-to-sound' : family === 'listening' || family === 'word-builder' ? 'sound-to-kana' : 'kana-to-sound'
  return { family, direction, ...overrides }
}

describe('computeAssessmentResults', () => {
  it('computes per-family scores', () => {
    const answers: AssessmentAnswer[] = [
      { question: q('kana-quiz', { characterId: 'a' }), correct: true },
      { question: q('kana-quiz', { characterId: 'i' }), correct: false },
      { question: q('listening', { word: WORD }), correct: true },
    ]
    const results = computeAssessmentResults(answers)
    expect(results.familyScores['kana-quiz']).toEqual({ correct: 1, total: 2 })
    expect(results.familyScores.listening).toEqual({ correct: 1, total: 1 })
    expect(results.familyScores['word-builder']).toEqual({ correct: 0, total: 0 })
  })

  it('derives Kana→Sound from Read + Word Reading', () => {
    const answers: AssessmentAnswer[] = [
      { question: q('kana-quiz', { kanaQuizDirection: 'read', direction: 'kana-to-sound', characterId: 'a' }), correct: true },
      { question: q('word-reading', { word: WORD }), correct: false },
    ]
    const results = computeAssessmentResults(answers)
    expect(results.directionScores.kanaToSound).toEqual({ correct: 1, total: 2 })
  })

  it('derives Sound→Kana from Recall + Listening + Word Builder', () => {
    const answers: AssessmentAnswer[] = [
      { question: q('kana-quiz', { kanaQuizDirection: 'recall', direction: 'sound-to-kana', characterId: 'a' }), correct: true },
      { question: q('listening', { word: WORD }), correct: true },
      { question: q('word-builder', { word: WORD }), correct: false },
    ]
    const results = computeAssessmentResults(answers)
    expect(results.directionScores.soundToKana).toEqual({ correct: 2, total: 3 })
  })

  it('tracks weak character/word ids from missed questions only', () => {
    const answers: AssessmentAnswer[] = [
      { question: q('kana-quiz', { characterId: 'a' }), correct: false },
      { question: q('kana-quiz', { characterId: 'i' }), correct: true },
      { question: q('listening', { word: WORD }), correct: false },
    ]
    const results = computeAssessmentResults(answers)
    expect(results.weakCharacterIds).toEqual(['a'])
    expect(results.weakWordIds).toEqual(['w1'])
  })

  it('computes overall correct/total independent of per-family breakdown', () => {
    const answers: AssessmentAnswer[] = [
      { question: q('kana-quiz', { characterId: 'a' }), correct: true },
      { question: q('listening', { word: WORD }), correct: false },
    ]
    const results = computeAssessmentResults(answers)
    expect(results.overallCorrect).toBe(1)
    expect(results.overallTotal).toBe(2)
  })
})

describe('getPracticeRecommendations', () => {
  it('recommends nothing when every family scores well', () => {
    const results = computeAssessmentResults([
      { question: q('kana-quiz', { characterId: 'a' }), correct: true },
      { question: q('listening', { word: WORD }), correct: true },
      { question: q('word-builder', { word: WORD }), correct: true },
      { question: q('word-reading', { word: WORD }), correct: true },
    ])
    expect(getPracticeRecommendations(results, 'hiragana')).toEqual([])
  })

  it('recommends the weakest family first, capped at 2', () => {
    const answers: AssessmentAnswer[] = [
      { question: q('kana-quiz', { characterId: 'a' }), correct: false },
      { question: q('kana-quiz', { characterId: 'i' }), correct: false },
      { question: q('listening', { word: WORD }), correct: false },
      { question: q('word-builder', { word: WORD }), correct: true },
      { question: q('word-reading', { word: WORD }), correct: false },
    ]
    const results = computeAssessmentResults(answers)
    const recs = getPracticeRecommendations(results, 'hiragana')
    expect(recs.length).toBeLessThanOrEqual(2)
    expect(recs.length).toBeGreaterThan(0)
    // Kana Quiz (0/2), Listening (0/1), Word Reading (0/1) all tie at 0% —
    // sort is stable-ish; just assert the returned routes are valid known
    // hiragana routes and word-builder (100%) is never recommended.
    expect(recs.every((r) => r.to.startsWith('/practice/hiragana') || r.to.startsWith('/restaurant/'))).toBe(true)
    expect(recs.some((r) => r.label.includes('Word Builder'))).toBe(false)
  })

  it('maps Word Reading weakness to a Restaurant/Cafe checkpoint route', () => {
    const answers: AssessmentAnswer[] = [{ question: q('word-reading', { word: WORD }), correct: false }]
    const results = computeAssessmentResults(answers)
    const recs = getPracticeRecommendations(results, 'katakana')
    expect(recs).toEqual([{ label: expect.stringContaining('Practice:'), to: '/restaurant/katakana-complete' }])
  })

  it('uses katakana-specific routes for the katakana script', () => {
    const answers: AssessmentAnswer[] = [{ question: q('kana-quiz', { characterId: 'katakana-a' }), correct: false }]
    const results = computeAssessmentResults(answers)
    const recs = getPracticeRecommendations(results, 'katakana')
    expect(recs[0].to).toContain('/katakana/')
  })
})
