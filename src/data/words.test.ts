import { describe, expect, it } from 'vitest'
import { WORDS_BY_ROW } from './words'

// Focused checks for the two new wa-row greetings — see words.ts's comment
// on this pair for why characterIds ends in 'ha' (は), not 'wa' (わ), even
// though both are pronounced "wa" (historical topic-marker spelling).
describe('wa-row: konnichiwa / konbanwa', () => {
  const words = WORDS_BY_ROW['wa-row']

  it('contains both new words', () => {
    expect(words.some((w) => w.id === 'wa-konnichiwa')).toBe(true)
    expect(words.some((w) => w.id === 'wa-konbanwa')).toBe(true)
  })

  it('wa-konnichiwa has the correct kana, romaji, meaning, and characterIds', () => {
    const word = words.find((w) => w.id === 'wa-konnichiwa')!
    expect(word.kana).toBe('こんにちは')
    expect(word.romaji).toBe('konnichiwa')
    expect(word.meaning).toBe('hello / good afternoon')
    expect(word.characterIds).toEqual(['ko', 'n', 'ni', 'chi', 'ha'])
    expect(word.audioText).toBe('こんにちは。')
  })

  it('wa-konbanwa has the correct kana, romaji, meaning, and characterIds', () => {
    const word = words.find((w) => w.id === 'wa-konbanwa')!
    expect(word.kana).toBe('こんばんは')
    expect(word.romaji).toBe('konbanwa')
    expect(word.meaning).toBe('good evening')
    expect(word.characterIds).toEqual(['ko', 'n', 'ba', 'n', 'ha'])
    expect(word.audioText).toBe('こんばんは。')
  })

  it('spelling is NOT converted to わ anywhere: kana ends in は, and the last characterId is "ha"', () => {
    for (const id of ['wa-konnichiwa', 'wa-konbanwa']) {
      const word = words.find((w) => w.id === id)!
      expect(word.kana.endsWith('は')).toBe(true)
      expect(word.kana.endsWith('わ')).toBe(false)
      expect(word.characterIds.at(-1)).toBe('ha')
    }
  })

  // No illustration exists for either greeting yet, and AnchorWord.image is
  // optional precisely so content can ship ahead of art (see types.ts) —
  // WordImage renders its placeholder instead. Asserting the field stays
  // ABSENT guards against pointing it at a word-icons/*.webp that isn't
  // actually committed, which would render as a broken image. Future art
  // would be word-icons/wa-konnichiwa.webp / word-icons/wa-konbanwa.webp.
  it('leaves image unset (no art yet — WordImage placeholder handles it)', () => {
    expect(words.find((w) => w.id === 'wa-konnichiwa')?.image).toBeUndefined()
    expect(words.find((w) => w.id === 'wa-konbanwa')?.image).toBeUndefined()
  })
})
