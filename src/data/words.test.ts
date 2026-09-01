import { describe, expect, it } from 'vitest'
import { WORDS_BY_ROW } from './words'

// Focused checks for the こんにちは/こんばんは greetings — see words.ts's
// comment on this pair for why characterIds ends in 'ha' (は), not 'wa'
// (わ), even though both are pronounced "wa" (historical topic-marker
// spelling). Moved from the now-deleted wa-row into the final combined
// ra-row (Issue #155) — see curriculum.test.ts for the row-merge coverage.
describe('ra-row: konnichiwa / konbanwa', () => {
  const words = WORDS_BY_ROW['ra-row']

  it('contains both words', () => {
    expect(words.some((w) => w.id === 'ra-konnichiwa')).toBe(true)
    expect(words.some((w) => w.id === 'ra-konbanwa')).toBe(true)
  })

  it('ra-konnichiwa has the correct kana, romaji, meaning, and characterIds', () => {
    const word = words.find((w) => w.id === 'ra-konnichiwa')!
    expect(word.kana).toBe('こんにちは')
    expect(word.romaji).toBe('konnichiwa')
    expect(word.meaning).toBe('hello / good afternoon')
    expect(word.characterIds).toEqual(['ko', 'n', 'ni', 'chi', 'ha'])
    expect(word.audioText).toBe('こんにちは。')
  })

  it('ra-konbanwa has the correct kana, romaji, meaning, and characterIds', () => {
    const word = words.find((w) => w.id === 'ra-konbanwa')!
    expect(word.kana).toBe('こんばんは')
    expect(word.romaji).toBe('konbanwa')
    expect(word.meaning).toBe('good evening')
    expect(word.characterIds).toEqual(['ko', 'n', 'ba', 'n', 'ha'])
    expect(word.audioText).toBe('こんばんは。')
  })

  it('spelling is NOT converted to わ anywhere: kana ends in は, and the last characterId is "ha"', () => {
    for (const id of ['ra-konnichiwa', 'ra-konbanwa']) {
      const word = words.find((w) => w.id === id)!
      expect(word.kana.endsWith('は')).toBe(true)
      expect(word.kana.endsWith('わ')).toBe(false)
      expect(word.characterIds.at(-1)).toBe('ha')
    }
  })

  // Both greetings have real illustrations, converted to the standard
  // 256x256 word-icons/*.webp convention (see public/word-icons/).
  it('image field points at the renamed webp assets under word-icons/', () => {
    expect(words.find((w) => w.id === 'ra-konnichiwa')?.image).toBe('word-icons/ra-konnichiwa.webp')
    expect(words.find((w) => w.id === 'ra-konbanwa')?.image).toBe('word-icons/ra-konbanwa.webp')
  })
})
