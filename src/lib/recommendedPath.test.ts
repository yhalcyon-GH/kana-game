import { describe, expect, it } from 'vitest'
import type { GojuonRow, ScriptCategory } from '../data/types'
import type { AssessmentCompletion, RowActivityCompletion } from '../store/progressStore'
import { getGlobalRecommendedTarget, getRecommendedActivity } from './recommendedPath'

const base = {
  learnStyle: 'character-set' as const,
  introCompleted: false,
  kanaQuizCompleted: false,
  listeningCompleted: false,
  wordBuilderCompleted: false,
}

describe('getRecommendedActivity: character-set', () => {
  it('walks Learn → Kana Quiz → Listening → Word Builder → done', () => {
    expect(getRecommendedActivity(base)).toBe('learn')
    expect(getRecommendedActivity({ ...base, introCompleted: true })).toBe('kana-quiz')
    expect(getRecommendedActivity({ ...base, introCompleted: true, kanaQuizCompleted: true })).toBe('listening')
    expect(getRecommendedActivity({ ...base, introCompleted: true, kanaQuizCompleted: true, listeningCompleted: true })).toBe('word-builder')
    expect(getRecommendedActivity({ ...base, introCompleted: true, kanaQuizCompleted: true, listeningCompleted: true, wordBuilderCompleted: true })).toBe('done')
  })
})

describe('getRecommendedActivity: contrast-pairs', () => {
  const contrastBase = { ...base, learnStyle: 'contrast-pairs' as const }
  it('skips Kana Quiz', () => {
    expect(getRecommendedActivity(contrastBase)).toBe('learn')
    expect(getRecommendedActivity({ ...contrastBase, introCompleted: true })).toBe('listening')
    expect(getRecommendedActivity({ ...contrastBase, introCompleted: true, listeningCompleted: true })).toBe('word-builder')
    expect(getRecommendedActivity({ ...contrastBase, introCompleted: true, listeningCompleted: true, wordBuilderCompleted: true })).toBe('done')
  })
})

describe('Sokuon/Chōon assessment endpoint', () => {
  it('appears after Chōon and disappears after completion without score gating', () => {
    const rows: GojuonRow[] = [
      { id: 'chouon-row', categoryId: 'chouon', label: 'ー', characterIds: [], order: 1 },
    ]
    const categories: ScriptCategory[] = [{ id: 'chouon', label: '長音', learnStyle: 'contrast-pairs' }]
    const completion = { 'chouon-row': { tracing: true, listening: true, wordBuilder: true } }
    expect(getGlobalRecommendedTarget(rows, categories, [], completion, { 'sokuon-chouon': { completed: false } })).toMatchObject({ activity: 'assessment', assessmentScript: 'sokuon-chouon' })
    expect(getGlobalRecommendedTarget(rows, categories, [], completion, { 'sokuon-chouon': { completed: true } })).toBeNull()
  })
})

const CATS: ScriptCategory[] = [
  { id: 'cat-a', label: 'A', learnStyle: 'character-set' },
  { id: 'cat-b', label: 'B', learnStyle: 'contrast-pairs' },
]
const ROWS: GojuonRow[] = [
  { id: 'a1', categoryId: 'cat-a', label: 'A1', order: 0, characterIds: [] },
  { id: 'a2', categoryId: 'cat-a', label: 'A2', order: 1, characterIds: [] },
  { id: 'a-summary', categoryId: 'cat-a', label: 'A*', order: 2, characterIds: [], isSummary: true },
  { id: 'b1', categoryId: 'cat-b', label: 'B1', order: 0, characterIds: [] },
]

describe('getGlobalRecommendedTarget', () => {
  it('targets the first incomplete activity and ignores later progress', () => {
    expect(getGlobalRecommendedTarget(ROWS, CATS, [], {})).toEqual({ categoryId: 'cat-a', rowId: 'a1', activity: 'learn' })
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a2'], { a2: { kanaQuiz: true, listening: true, wordBuilder: true } })).toEqual({
      categoryId: 'cat-a', rowId: 'a1', activity: 'learn',
    })
  })

  it('advances between rows/categories and skips summary rows', () => {
    const firstDone: Record<string, RowActivityCompletion> = { a1: { kanaQuiz: true, listening: true, wordBuilder: true } }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a1'], firstDone)).toEqual({ categoryId: 'cat-a', rowId: 'a2', activity: 'learn' })

    const categoryDone: Record<string, RowActivityCompletion> = {
      a1: { kanaQuiz: true, listening: true, wordBuilder: true },
      a2: { kanaQuiz: true, listening: true, wordBuilder: true },
    }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a1', 'a2'], categoryDone)).toEqual({ categoryId: 'cat-b', rowId: 'b1', activity: 'learn' })
  })

  it('is null once every modeled category is complete', () => {
    const completion: Record<string, RowActivityCompletion> = {
      a1: { kanaQuiz: true, listening: true, wordBuilder: true },
      a2: { kanaQuiz: true, listening: true, wordBuilder: true },
      b1: { listening: true, wordBuilder: true },
    }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a1', 'a2', 'b1'], completion)).toBeNull()
  })
})

const ASSESSMENT_CATS: ScriptCategory[] = [
  { id: 'hiragana', label: 'Hiragana', learnStyle: 'character-set' },
  { id: 'katakana', label: 'Katakana', learnStyle: 'character-set' },
]
const ASSESSMENT_ROWS: GojuonRow[] = [
  { id: 'ra-row', categoryId: 'hiragana', label: 'ら〜ろ', order: 0, characterIds: [] },
  { id: 'katakana-ra-row', categoryId: 'katakana', label: 'ラ〜ロ', order: 0, characterIds: [] },
]
const BOTH_ROWS_DONE: Record<string, RowActivityCompletion> = {
  'ra-row': { kanaQuiz: true, listening: true, wordBuilder: true, checkpoint: true },
  'katakana-ra-row': { kanaQuiz: true, listening: true, wordBuilder: true, checkpoint: true },
}
const incompleteAssessments: Record<'hiragana' | 'katakana', AssessmentCompletion> = {
  hiragana: { completed: false },
  katakana: { completed: false },
}

describe('section assessment endpoints', () => {
  it('stops on Hiragana Test after the final Hiragana checkpoint, including after a fresh recomputation/reload', () => {
    const expected = { categoryId: 'hiragana', rowId: 'ra-row', activity: 'assessment', assessmentScript: 'hiragana' }
    expect(getGlobalRecommendedTarget(ASSESSMENT_ROWS, ASSESSMENT_CATS, ['ra-row'], BOTH_ROWS_DONE, incompleteAssessments)).toEqual(expected)
    expect(getGlobalRecommendedTarget(ASSESSMENT_ROWS, ASSESSMENT_CATS, ['ra-row'], { ...BOTH_ROWS_DONE }, { ...incompleteAssessments })).toEqual(expected)
  })

  it('moves to Katakana only after Hiragana Test completion, then stops on Katakana Test', () => {
    const hiraganaDone = { ...incompleteAssessments, hiragana: { completed: true } }
    expect(getGlobalRecommendedTarget(ASSESSMENT_ROWS, ASSESSMENT_CATS, ['ra-row'], BOTH_ROWS_DONE, hiraganaDone)).toEqual({
      categoryId: 'katakana', rowId: 'katakana-ra-row', activity: 'learn',
    })
  })

  it('stops on Katakana Test only after Katakana rows/checkpoints are complete', () => {
    const hiraganaDone = { ...incompleteAssessments, hiragana: { completed: true } }
    expect(getGlobalRecommendedTarget(ASSESSMENT_ROWS, ASSESSMENT_CATS, ['ra-row', 'katakana-ra-row'], BOTH_ROWS_DONE, hiraganaDone)).toEqual({
      categoryId: 'katakana', rowId: 'katakana-ra-row', activity: 'assessment', assessmentScript: 'katakana',
    })
  })

  it('moves beyond both sections once both tests are completed; score is not part of the decision', () => {
    const allDone = {
      hiragana: { completed: true, lastScore: { correct: 0, total: 20 } },
      katakana: { completed: true, lastScore: { correct: 0, total: 20 } },
    }
    expect(getGlobalRecommendedTarget(ASSESSMENT_ROWS, ASSESSMENT_CATS, ['ra-row', 'katakana-ra-row'], BOTH_ROWS_DONE, allDone)).toBeNull()
  })
})
