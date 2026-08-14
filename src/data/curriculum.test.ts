import { describe, expect, it } from 'vitest'
import { CHARACTERS_BY_ID } from './characters'
import { CATEGORIES_BY_ID, getCumulativeCharacterIds, getNextRowId, getPreviousRowId, ROWS } from './curriculum'
import { WORDS_BY_ROW } from './words'

describe('curriculum content integrity', () => {
  it('every character id referenced by a word exists in characters.ts', () => {
    for (const words of Object.values(WORDS_BY_ROW)) {
      for (const word of words) {
        for (const charId of word.characterIds) {
          expect(CHARACTERS_BY_ID[charId], `unknown character id "${charId}" in word "${word.id}"`).toBeDefined()
        }
      }
    }
  })

  it('every word only uses characters introduced at or before its row', () => {
    for (const row of ROWS) {
      const known = new Set(getCumulativeCharacterIds(row.id))
      for (const word of WORDS_BY_ROW[row.id] ?? []) {
        for (const charId of word.characterIds) {
          expect(
            known.has(charId),
            `word "${word.id}" (row "${row.id}") uses character "${charId}" before it is taught`,
          ).toBe(true)
        }
      }
    }
  })

  it('word kana string matches the concatenation of its characterIds', () => {
    for (const words of Object.values(WORDS_BY_ROW)) {
      for (const word of words) {
        // U+3040-30FF covers hiragana (3040-309F) AND katakana (30A0-30FF)
        // contiguously, so one range strips punctuation/kanji from a word's
        // audioText-adjacent `kana` field regardless of which script it's
        // in. A hiragana-only range here would silently zero out every
        // katakana word's comparison (all its characters would be
        // stripped, both sides would be '', and the check would pass
        // vacuously) — this bit a first draft of katakana support.
        const kanaOnly = word.kana.replace(/[^぀-ヿ]/g, '')
        const rebuilt = word.characterIds.map((id) => CHARACTERS_BY_ID[id].kana).join('')
        expect(rebuilt, `word "${word.id}" characterIds don't spell its kana`).toBe(kanaOnly)
      }
    }
  })

  it('each row has at least 4 words for the mini-games to draw from', () => {
    for (const row of ROWS) {
      expect((WORDS_BY_ROW[row.id] ?? []).length, `row "${row.id}" has too few words`).toBeGreaterThanOrEqual(4)
    }
  })

  it('every row references a real category', () => {
    for (const row of ROWS) {
      expect(CATEGORIES_BY_ID[row.categoryId], `row "${row.id}" references unknown category "${row.categoryId}"`).toBeDefined()
    }
  })
})

// Regression coverage for the category-scoped row-order helpers (see
// docs/curriculum-extensibility.md) — these all filter by categoryId before
// comparing `order`, so a second category's rows numbering their own order
// from 0 doesn't collide with or extend the first category's sequence.
describe('category-scoped row-order helpers', () => {
  it('getCumulativeCharacterIds only includes characters from earlier rows in the SAME category', () => {
    const cumulative = getCumulativeCharacterIds('ka-row')
    expect(cumulative).toEqual(expect.arrayContaining(['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko']))
    // ta-row comes after ka-row, so none of its characters should be included yet.
    expect(cumulative).not.toEqual(expect.arrayContaining(['ta', 'chi', 'tsu', 'te', 'to']))
  })

  it('getNextRowId/getPreviousRowId walk the sequence within the row\'s own category', () => {
    expect(getNextRowId('a-row')).toBe('ka-row')
    expect(getPreviousRowId('ka-row')).toBe('a-row')
    expect(getPreviousRowId('a-row')).toBeNull()
    expect(getNextRowId('wa-row')).toBeNull()
  })

  it('all three helpers return an empty/null result for an unknown row id rather than throwing', () => {
    expect(getCumulativeCharacterIds('not-a-real-row')).toEqual([])
    expect(getNextRowId('not-a-real-row')).toBeNull()
    expect(getPreviousRowId('not-a-real-row')).toBeNull()
  })
})
