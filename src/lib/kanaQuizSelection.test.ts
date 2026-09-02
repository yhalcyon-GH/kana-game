import { describe, expect, it } from 'vitest'
import { ROWS_BY_ID } from '../data/curriculum'
import { EXCLUDED_FROM_KANA_QUIZ } from '../data/characters'
import { buildKanaQuizTargetQueue, getKanaQuizRounds } from './kanaQuizSelection'

const box0 = () => 0
const eligibleIds = (rowId: string) => ROWS_BY_ID[rowId].characterIds.filter((id) => !EXCLUDED_FROM_KANA_QUIZ.has(id))

describe('getKanaQuizRounds', () => {
  it('keeps normal rows at 8', () => {
    expect(getKanaQuizRounds('ka-row', 8)).toBe(8)
  })

  it('uses 12 for hiragana and katakana ha rows', () => {
    expect(getKanaQuizRounds('ha-row', 8)).toBe(12)
    expect(getKanaQuizRounds('katakana-ha-row', 8)).toBe(12)
  })

  it('uses 16 for the first combined Katakana row', () => {
    expect(getKanaQuizRounds('katakana-a-row', 8)).toBe(16)
  })

  it('preserves an existing non-normal default for unrelated scopes', () => {
    expect(getKanaQuizRounds('hiragana-summary', 15)).toBe(15)
  })
})

describe('buildKanaQuizTargetQueue', () => {
  it('puts every seion/base kana first, then distinct dakuten for ka-row', () => {
    const ids = eligibleIds('ka-row')
    const queue = buildKanaQuizTargetQueue(ids, box0, 8)
    const seion = new Set(['ka', 'ki', 'ku', 'ke', 'ko'])

    expect(queue).toHaveLength(8)
    expect(new Set(queue.slice(0, 5))).toEqual(seion)
    expect(new Set(queue).size).toBe(8)
    expect(queue.slice(5).every((id) => !seion.has(id))).toBe(true)
  })

  it('guarantees all five seion first in 12-question ha-row and avoids duplicates while distinct targets remain', () => {
    const ids = eligibleIds('ha-row')
    const queue = buildKanaQuizTargetQueue(ids, box0, 12)
    const seion = new Set(['ha', 'hi', 'fu', 'he', 'ho'])

    expect(queue).toHaveLength(12)
    expect(new Set(queue.slice(0, 5))).toEqual(seion)
    expect(new Set(queue).size).toBe(12)
    expect(queue.slice(5).every((id) => !seion.has(id))).toBe(true)
  })

  it('does the same for katakana ha-row', () => {
    const ids = eligibleIds('katakana-ha-row')
    const queue = buildKanaQuizTargetQueue(ids, box0, 12)
    const seion = new Set(['katakana-ha', 'katakana-hi', 'katakana-fu', 'katakana-he', 'katakana-ho'])

    expect(queue).toHaveLength(12)
    expect(new Set(queue.slice(0, 5))).toEqual(seion)
    expect(new Set(queue).size).toBe(12)
  })

  it('covers every eligible target exactly once in the 16-question first Katakana row', () => {
    const ids = eligibleIds('katakana-a-row')
    const queue = buildKanaQuizTargetQueue(ids, box0, 16)

    expect(ids).toHaveLength(16)
    expect(queue).toHaveLength(16)
    expect(new Set(queue)).toEqual(new Set(ids))
    expect(new Set(queue).size).toBe(16)
  })

  it('repeats only when the session is longer than the distinct target pool', () => {
    const ids = eligibleIds('ya-row')
    const queue = buildKanaQuizTargetQueue(ids, box0, 8)

    expect(ids).toHaveLength(3)
    expect(queue).toHaveLength(8)
    expect(new Set(queue)).toEqual(new Set(ids))
    for (let i = 1; i < queue.length; i += 1) expect(queue[i]).not.toBe(queue[i - 1])
  })
})
