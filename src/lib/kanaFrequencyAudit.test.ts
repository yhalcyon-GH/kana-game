import { describe, expect, it } from 'vitest'
import { CHARACTERS, CHARACTERS_BY_ID } from '../data/characters'
import { ALL_WORDS } from '../data/words'
import {
  computeKanaFrequency,
  DOCUMENTED_STRUCTURAL_EXCEPTIONS,
  getLowFrequencyTail,
} from './kanaFrequencyAudit'

describe('computeKanaFrequency', () => {
  const frequencies = computeKanaFrequency()

  it('returns exactly one entry per taught character, in CHARACTERS order', () => {
    expect(frequencies).toHaveLength(CHARACTERS.length)
    expect(frequencies.map((f) => f.characterId)).toEqual(CHARACTERS.map((c) => c.id))
  })

  it('sums totalOccurrences across every entry to the total characterIds usage in ALL_WORDS', () => {
    const expectedTotal = ALL_WORDS.reduce((sum, word) => sum + word.characterIds.length, 0)
    const actualTotal = frequencies.reduce((sum, f) => sum + f.totalOccurrences, 0)
    expect(actualTotal).toBe(expectedTotal)
  })

  it('counts a character used twice in the same word as 2 occurrences but 1 distinct word', () => {
    // ka-koko: ['ko', 'ko'] — see words.ts ka-row.
    const koko = ALL_WORDS.find((w) => w.id === 'ka-koko')
    expect(koko?.characterIds).toEqual(['ko', 'ko'])
    const ko = frequencies.find((f) => f.characterId === 'ko')!
    expect(ko.wordIds).toContain('ka-koko')
    // Occurrences must be >= 2x the number of distinct words containing a
    // doubled character somewhere — a weak but cheap regression check that
    // occurrence counting isn't silently deduplicating within a word.
    expect(ko.totalOccurrences).toBeGreaterThanOrEqual(ko.distinctWordCount + 1)
  })

  it('every character with at least one word has that word actually listing the character id', () => {
    for (const f of frequencies) {
      for (const wordId of f.wordIds) {
        const word = ALL_WORDS.find((w) => w.id === wordId)
        expect(word, `word "${wordId}" referenced by character "${f.characterId}" does not exist`).toBeDefined()
        expect(word!.characterIds).toContain(f.characterId)
      }
    }
  })

  it('distinguishes hiragana from the katakana namespace for identically-romanized characters', () => {
    // Regression for "count by character id, not naive romaji/glyph" —
    // hiragana か and katakana カ share romaji 'ka' but are unrelated ids.
    const hiraganaKa = frequencies.find((f) => f.characterId === 'ka')!
    const katakanaKa = frequencies.find((f) => f.characterId === 'katakana-ka')!
    expect(hiraganaKa.totalOccurrences).not.toBe(0)
    expect(katakanaKa.totalOccurrences).not.toBe(0)
    expect(hiraganaKa.wordIds).not.toEqual(katakanaKa.wordIds)
  })

  it('counts a 2-glyph yōon mora (e.g. きゃ) as one character occurrence, not two', () => {
    const kyaku = ALL_WORDS.find((w) => w.id === 'youon-ka-kyaku')!
    expect(kyaku.kana).toBe('きゃく')
    expect(kyaku.characterIds).toEqual(['kya', 'ku'])
    const kya = frequencies.find((f) => f.characterId === 'kya')!
    expect(kya.wordIds).toContain('youon-ka-kyaku')
  })

  it('を (particle-only kana) has real, non-zero-but-minimal coverage via its one phrase', () => {
    const wo = frequencies.find((f) => f.characterId === 'wo')!
    expect(wo.totalOccurrences).toBe(1)
    expect(wo.wordIds).toEqual(['ra-mizu-wo-nomu'])
  })
})

describe('getLowFrequencyTail', () => {
  it('returns entries at or below the threshold, sorted worst (0) first', () => {
    const frequencies = computeKanaFrequency()
    const tail = getLowFrequencyTail(frequencies, 1)
    expect(tail.length).toBeGreaterThan(0)
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i].totalOccurrences).toBeGreaterThanOrEqual(tail[i - 1].totalOccurrences)
    }
    expect(tail.every((f) => f.totalOccurrences <= 1)).toBe(true)
  })

  it('defaults to a threshold of 1 when none is passed', () => {
    const frequencies = computeKanaFrequency()
    expect(getLowFrequencyTail(frequencies)).toEqual(getLowFrequencyTail(frequencies, 1))
  })

  it('an empty frequency list yields an empty tail', () => {
    expect(getLowFrequencyTail([])).toEqual([])
  })
})

describe('DOCUMENTED_STRUCTURAL_EXCEPTIONS', () => {
  it('every key is a real, currently-taught character id', () => {
    for (const characterId of Object.keys(DOCUMENTED_STRUCTURAL_EXCEPTIONS)) {
      expect(CHARACTERS_BY_ID[characterId], `"${characterId}" is not a known character id`).toBeDefined()
    }
  })

  it('every documented exception genuinely has zero or one occurrence today (not stale)', () => {
    const frequencies = computeKanaFrequency()
    for (const characterId of Object.keys(DOCUMENTED_STRUCTURAL_EXCEPTIONS)) {
      const entry = frequencies.find((f) => f.characterId === characterId)!
      expect(
        entry.totalOccurrences,
        `"${characterId}" is documented as a low-coverage structural exception but now has ${entry.totalOccurrences} occurrences — update or remove this exception entry`,
      ).toBeLessThanOrEqual(1)
    }
  })
})
