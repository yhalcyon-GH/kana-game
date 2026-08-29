import { describe, expect, it } from 'vitest'
import { isNearMissCharacterChoice, isNearMissTypedKana, isNearMissWordBuilder, isNearMissWordChoice } from './nearMiss'

describe('isNearMissCharacterChoice', () => {
  it('a shape-confusable pick is a near miss', () => {
    expect(isNearMissCharacterChoice('a', 'o')).toBe(true) // あ/お confusion group
  })

  it('an unrelated pick is not a near miss', () => {
    expect(isNearMissCharacterChoice('a', 'n')).toBe(false)
  })

  it('the correct id picked "wrong" (a === chosen) is never a near miss', () => {
    expect(isNearMissCharacterChoice('a', 'a')).toBe(false)
  })
})

describe('isNearMissWordChoice', () => {
  const aiWord = { id: 'w-ai', characterIds: ['a', 'i'] }
  const oiWord = { id: 'w-oi', characterIds: ['o', 'i'] } // differs only at position 0, あ/お is a confusable pair
  const niWord = { id: 'w-ni', characterIds: ['n', 'i'] } // differs only at position 0, あ/ん is not confusable
  const differentLengthWord = { id: 'w-long', characterIds: ['a', 'i', 'u'] }

  it('same length, one confusable-character difference is a near miss', () => {
    expect(isNearMissWordChoice(aiWord, oiWord)).toBe(true)
  })

  it('same length, one non-confusable-character difference is not a near miss', () => {
    expect(isNearMissWordChoice(aiWord, niWord)).toBe(false)
  })

  it('different character-count is never a near miss', () => {
    expect(isNearMissWordChoice(aiWord, differentLengthWord)).toBe(false)
  })

  it('the same word is never a near miss of itself', () => {
    expect(isNearMissWordChoice(aiWord, aiWord)).toBe(false)
  })
})

// Word Builder's near miss must be judged by learning-UNIT owner count, not
// raw display-tile count — a split yōon/Special Katakana character (e.g.
// きゃ -> [キ][ャ]) contributes 2 display tiles but is still exactly ONE
// learning unit, so missing only one of its two tiles must count as ONE
// wrong unit, not two. WordBuilderPage is responsible for folding display
// tiles back into owner charIds before calling this — this function itself
// only ever sees the already-folded unit counts, so these tests exercise
// exactly the contract WordBuilderPage relies on.
describe('isNearMissWordBuilder', () => {
  it('exactly one wrong unit out of 2+ units is a near miss', () => {
    expect(isNearMissWordBuilder(1, 2)).toBe(true)
    expect(isNearMissWordBuilder(1, 6)).toBe(true) // e.g. キャンディー: 6 owner units, 1 wrong (きゃ, whichever half was missed)
  })

  it('two or more wrong units is not a near miss', () => {
    expect(isNearMissWordBuilder(2, 6)).toBe(false)
    expect(isNearMissWordBuilder(3, 3)).toBe(false)
  })

  it('a single-unit word\'s only unit being wrong is not a near miss (nothing else to be "close" to)', () => {
    expect(isNearMissWordBuilder(1, 1)).toBe(false)
  })

  it('zero wrong units (should not normally be called on a correct answer) is not a near miss', () => {
    expect(isNearMissWordBuilder(0, 4)).toBe(false)
  })
})

describe('isNearMissTypedKana', () => {
  it('exactly one character off (substitution) is a near miss', () => {
    expect(isNearMissTypedKana('あお', 'あい')).toBe(true)
  })

  it('exactly one character off (insertion/deletion) is a near miss', () => {
    expect(isNearMissTypedKana('あい', 'あいう')).toBe(true)
    expect(isNearMissTypedKana('あいう', 'あい')).toBe(true)
  })

  it('two or more characters off is not a near miss', () => {
    expect(isNearMissTypedKana('うえ', 'あい')).toBe(false)
  })

  it('an empty input is never a near miss', () => {
    expect(isNearMissTypedKana('', 'あい')).toBe(false)
  })

  it('an exact match is not a near miss (distance 0, not the wrong-answer path anyway)', () => {
    expect(isNearMissTypedKana('あい', 'あい')).toBe(false)
  })
})
