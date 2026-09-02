import { describe, expect, it } from 'vitest'
import type { GojuonRow, ScriptCategory } from '../data/types'
import type { RowActivityCompletion } from '../store/progressStore'
import { getGlobalRecommendedTarget, getRecommendedActivity, HIRAGANA_TEST_STEP_ID, KATAKANA_TEST_STEP_ID } from './recommendedPath'

const base = {
  learnStyle: 'character-set' as const,
  introCompleted: false,
  kanaQuizCompleted: false,
  listeningCompleted: false,
  wordBuilderCompleted: false,
}

describe('getRecommendedActivity: character-set', () => {
  it('recommends Learn when intro (Learn/Tracing) is not completed', () => {
    expect(getRecommendedActivity(base)).toBe('learn')
  })

  it('recommends Kana Quiz once intro is completed', () => {
    expect(getRecommendedActivity({ ...base, introCompleted: true })).toBe('kana-quiz')
  })

  it('recommends Listening once Kana Quiz is completed', () => {
    expect(getRecommendedActivity({ ...base, introCompleted: true, kanaQuizCompleted: true })).toBe('listening')
  })

  it('recommends Word Builder once Listening is completed', () => {
    expect(
      getRecommendedActivity({ ...base, introCompleted: true, kanaQuizCompleted: true, listeningCompleted: true }),
    ).toBe('word-builder')
  })

  it('is "done" once Word Builder is completed', () => {
    expect(
      getRecommendedActivity({
        ...base,
        introCompleted: true,
        kanaQuizCompleted: true,
        listeningCompleted: true,
        wordBuilderCompleted: true,
      }),
    ).toBe('done')
  })
})

describe('getRecommendedActivity: contrast-pairs (no Kana Quiz step)', () => {
  const contrastBase = { ...base, learnStyle: 'contrast-pairs' as const }

  it('recommends Learn when intro is not completed', () => {
    expect(getRecommendedActivity(contrastBase)).toBe('learn')
  })

  it('recommends Listening directly once intro is completed (Kana Quiz is skipped)', () => {
    expect(getRecommendedActivity({ ...contrastBase, introCompleted: true })).toBe('listening')
  })

  it('recommends Word Builder once Listening is completed', () => {
    expect(getRecommendedActivity({ ...contrastBase, introCompleted: true, listeningCompleted: true })).toBe(
      'word-builder',
    )
  })

  it('is "done" once Word Builder is completed, even though kanaQuizCompleted was never set', () => {
    expect(
      getRecommendedActivity({ ...contrastBase, introCompleted: true, listeningCompleted: true, wordBuilderCompleted: true }),
    ).toBe('done')
  })
})

// Small synthetic 2-category, 2-row-each curriculum — isolates
// getGlobalRecommendedTarget's own row/category walking logic from the
// real app's curriculum (which useCurriculum.test.ts/HomePage.test.tsx/
// PracticeHubPage.test.tsx already exercise end-to-end).
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
  it('targets the first row\'s intro step when nothing is done', () => {
    expect(getGlobalRecommendedTarget(ROWS, CATS, [], {})).toEqual({
      categoryId: 'cat-a',
      rowId: 'a1',
      activity: 'learn',
    })
  })

  it('advances within a row as its own steps complete', () => {
    const completion: Record<string, RowActivityCompletion> = { a1: { kanaQuiz: true } }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a1'], completion)).toEqual({
      categoryId: 'cat-a',
      rowId: 'a1',
      activity: 'listening',
    })
  })

  it('does not move when a LATER activity in the same row is completed first', () => {
    // wordBuilder done, but kanaQuiz/listening are not — kanaQuiz is
    // earlier in the sequence and stays the target.
    const completion: Record<string, RowActivityCompletion> = { a1: { wordBuilder: true } }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a1'], completion)).toEqual({
      categoryId: 'cat-a',
      rowId: 'a1',
      activity: 'kana-quiz',
    })
  })

  it('moves to the next row once the current row is fully done', () => {
    const completion: Record<string, RowActivityCompletion> = {
      a1: { kanaQuiz: true, listening: true, wordBuilder: true },
    }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a1'], completion)).toEqual({
      categoryId: 'cat-a',
      rowId: 'a2',
      activity: 'learn',
    })
  })

  it('does not move when a LATER row is touched before an earlier row is finished', () => {
    const completion: Record<string, RowActivityCompletion> = { a2: { kanaQuiz: true, listening: true, wordBuilder: true } }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a2'], completion)).toEqual({
      categoryId: 'cat-a',
      rowId: 'a1',
      activity: 'learn',
    })
  })

  it('skips summary rows entirely', () => {
    const completion: Record<string, RowActivityCompletion> = {
      a1: { kanaQuiz: true, listening: true, wordBuilder: true },
      a2: { kanaQuiz: true, listening: true, wordBuilder: true },
    }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a1', 'a2'], completion)?.rowId).toBe('b1')
  })

  it('moves into the next category once every row in the current one is done', () => {
    const completion: Record<string, RowActivityCompletion> = {
      a1: { kanaQuiz: true, listening: true, wordBuilder: true },
      a2: { kanaQuiz: true, listening: true, wordBuilder: true },
    }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a1', 'a2'], completion)).toEqual({
      categoryId: 'cat-b',
      rowId: 'b1',
      activity: 'learn',
    })
  })

  it('is null once every category is fully done', () => {
    const completion: Record<string, RowActivityCompletion> = {
      a1: { kanaQuiz: true, listening: true, wordBuilder: true },
      a2: { kanaQuiz: true, listening: true, wordBuilder: true },
      b1: { listening: true, wordBuilder: true },
    }
    expect(getGlobalRecommendedTarget(ROWS, CATS, ['a1', 'a2', 'b1'], completion)).toBeNull()
  })

  it('never returns more than one target — the return value is always a single object or null', () => {
    const result = getGlobalRecommendedTarget(ROWS, CATS, [], {})
    expect(result).not.toBeNull()
    expect(Array.isArray(result)).toBe(false)
  })
})

// Issue #189: ASSESSMENT_STEPS is hardcoded to the real 'hiragana'/
// 'katakana' category ids (never inferred from CATEGORIES order — see its
// own comment), so this synthetic fixture reuses those exact ids to exercise
// the insertion logic in isolation, independent of the full real curriculum
// (already covered end-to-end by useCurriculum.test.ts).
describe('getGlobalRecommendedTarget: Hiragana/Katakana Test endpoint', () => {
  const scriptCats: ScriptCategory[] = [
    { id: 'hiragana', label: 'H', learnStyle: 'character-set' },
    { id: 'katakana', label: 'K', learnStyle: 'character-set' },
  ]
  const scriptRows: GojuonRow[] = [
    { id: 'h1', categoryId: 'hiragana', label: 'H1', order: 0, characterIds: [] },
    { id: 'k1', categoryId: 'katakana', label: 'K1', order: 0, characterIds: [] },
  ]
  const doneCompletion: Record<string, RowActivityCompletion> = {
    h1: { kanaQuiz: true, listening: true, wordBuilder: true },
    k1: { kanaQuiz: true, listening: true, wordBuilder: true },
  }

  it('targets the Hiragana Test once hiragana rows are done but the test is not, without any assessmentCompletion arg (defaults to none done)', () => {
    expect(getGlobalRecommendedTarget(scriptRows, scriptCats, ['h1'], doneCompletion)).toEqual({
      categoryId: 'hiragana',
      rowId: HIRAGANA_TEST_STEP_ID,
      activity: 'hiragana-test',
    })
  })

  it('moves into katakana once the Hiragana Test is marked done, without touching katakana rows', () => {
    expect(getGlobalRecommendedTarget(scriptRows, scriptCats, ['h1'], doneCompletion, { hiragana: true })).toEqual({
      categoryId: 'katakana',
      rowId: 'k1',
      activity: 'learn',
    })
  })

  it('targets the Katakana Test once both categories rows are done but only hiragana Test is', () => {
    expect(getGlobalRecommendedTarget(scriptRows, scriptCats, ['h1', 'k1'], doneCompletion, { hiragana: true })).toEqual({
      categoryId: 'katakana',
      rowId: KATAKANA_TEST_STEP_ID,
      activity: 'katakana-test',
    })
  })

  it('is null once both rows and both Tests are done', () => {
    expect(
      getGlobalRecommendedTarget(scriptRows, scriptCats, ['h1', 'k1'], doneCompletion, { hiragana: true, katakana: true }),
    ).toBeNull()
  })
})
