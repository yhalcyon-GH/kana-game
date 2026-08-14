import { describe, expect, it } from 'vitest'
import { isNearMissSequence, isNearMissText, levenshteinDistance } from './answerCloseness'

describe('levenshteinDistance', () => {
  it('is 0 for identical sequences', () => {
    expect(levenshteinDistance([...'abc'], [...'abc'])).toBe(0)
  })

  it('counts a single substitution as distance 1', () => {
    expect(levenshteinDistance([...'かき'], [...'がき'])).toBe(1)
  })

  it('counts a single insertion/deletion as distance 1', () => {
    expect(levenshteinDistance([...'ab'], [...'abc'])).toBe(1)
  })

  it('counts multiple differences correctly', () => {
    expect(levenshteinDistance([...'kitten'], [...'sitting'])).toBe(3)
  })
})

describe('isNearMissText', () => {
  it('is true for exactly one character off', () => {
    expect(isNearMissText('かき', 'がき')).toBe(true)
  })

  it('is true for a single dakuten mistake', () => {
    expect(isNearMissText('は', 'ば')).toBe(true)
  })

  it('is false for an exact match (distance 0)', () => {
    expect(isNearMissText('かき', 'かき')).toBe(false)
  })

  it('is false for two or more characters off', () => {
    expect(isNearMissText('さしみ', 'かきく')).toBe(false)
  })
})

describe('isNearMissSequence', () => {
  it('works over arbitrary element arrays, not just characters', () => {
    expect(isNearMissSequence(['ka', 'ki', 'ku'], ['ka', 'ki', 'ke'])).toBe(true)
    expect(isNearMissSequence(['ka', 'ki'], ['ka', 'ki'])).toBe(false)
  })
})
