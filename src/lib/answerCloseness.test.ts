import { describe, expect, it } from 'vitest'
import { levenshteinDistance } from './answerCloseness'

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
