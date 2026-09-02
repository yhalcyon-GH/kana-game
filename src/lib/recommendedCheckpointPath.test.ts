import { describe, expect, it } from 'vitest'
import { CATEGORIES, ROWS } from '../data/curriculum'
import type { RowActivityCompletion } from '../store/progressStore'
import { getGlobalRecommendedTarget, getRecommendedActivity } from './recommendedPath'

const finishedCore = {
  introCompleted: true,
  kanaQuizCompleted: true,
  listeningCompleted: true,
  wordBuilderCompleted: true,
  learnStyle: 'character-set' as const,
}

describe('Recommended real-life checkpoint step', () => {
  it('comes after Word Builder and before done', () => {
    expect(getRecommendedActivity({ ...finishedCore, checkpointMode: 'restaurant', checkpointCompleted: false })).toBe('restaurant')
    expect(getRecommendedActivity({ ...finishedCore, checkpointMode: 'cafe', checkpointCompleted: false })).toBe('cafe')
    expect(getRecommendedActivity({ ...finishedCore, checkpointMode: 'restaurant', checkpointCompleted: true })).toBe('done')
  })

  it('does not affect rows without a checkpoint', () => {
    expect(getRecommendedActivity(finishedCore)).toBe('done')
  })

  it('makes na-row Restaurant the global target after its core steps are complete', () => {
    const rowsBeforeNa = ['a-row', 'ka-row', 'sa-row', 'ta-row']
    const taught = [...rowsBeforeNa, 'na-row']
    const completion: Record<string, RowActivityCompletion> = Object.fromEntries(
      rowsBeforeNa.map((rowId) => [rowId, { kanaQuiz: true, listening: true, wordBuilder: true }]),
    )
    completion['na-row'] = { kanaQuiz: true, listening: true, wordBuilder: true }

    expect(getGlobalRecommendedTarget(ROWS, CATEGORIES, taught, completion)).toEqual({
      categoryId: 'hiragana',
      rowId: 'na-row',
      activity: 'restaurant',
    })
  })

  it('moves from na-row Restaurant to ha-row only after checkpoint completion', () => {
    const rowsThroughNa = ['a-row', 'ka-row', 'sa-row', 'ta-row', 'na-row']
    const completion: Record<string, RowActivityCompletion> = Object.fromEntries(
      rowsThroughNa.map((rowId) => [rowId, { kanaQuiz: true, listening: true, wordBuilder: true }]),
    )
    completion['na-row'].checkpoint = true

    expect(getGlobalRecommendedTarget(ROWS, CATEGORIES, rowsThroughNa, completion)).toEqual({
      categoryId: 'hiragana',
      rowId: 'ha-row',
      activity: 'learn',
    })
  })
})
