import { describe, expect, it } from 'vitest'
import type { AnchorWord } from '../data/types'
import { checkWordReading, checkWordReadingAlternatives, identifyWordReading } from './wordReadingMatching'

const neko: AnchorWord = { id: 'neko', kana: 'ねこ', romaji: 'neko', meaning: 'cat', characterIds: ['ne', 'ko'] }
const inu: AnchorWord = { id: 'inu', kana: 'いぬ', romaji: 'inu', meaning: 'dog', characterIds: ['i', 'nu'] }
const candidates = [neko, inu]

describe('identifyWordReading', () => {
  it('matches an exact normalized transcript', () => {
    expect(identifyWordReading('ねこ', candidates)).toBe(neko)
  })

  it('matches an already katakana-folded transcript against a hiragana word', () => {
    // identifyWordReading takes an already-normalized transcript (same
    // contract as restaurantMatching.ts's identifyDish) — script-folding
    // itself is normalizeJapanese's job, exercised via checkWordReading
    // below.
    expect(identifyWordReading('ねこ', candidates)).toBe(neko)
  })

  it('matches when the target kana is a substring of a longer transcript', () => {
    expect(identifyWordReading('それはねこです', candidates)).toBe(neko)
  })

  it('returns null when nothing matches', () => {
    expect(identifyWordReading('さかな', candidates)).toBeNull()
  })
})

describe('checkWordReading', () => {
  it('succeeds when the transcript names the target', () => {
    expect(checkWordReading('ねこ', candidates, neko)).toEqual({ outcome: 'success' })
  })

  it('succeeds for a katakana transcript against a hiragana target (script-folded)', () => {
    expect(checkWordReading('ネコ', candidates, neko)).toEqual({ outcome: 'success' })
  })

  it('reports wrong-word when a different valid candidate is named', () => {
    expect(checkWordReading('いぬ', candidates, neko)).toEqual({ outcome: 'wrong-word', identified: inu })
  })

  it('reports unrecognized when nothing in the candidate pool matches', () => {
    expect(checkWordReading('さかな', candidates, neko)).toEqual({ outcome: 'unrecognized' })
  })
})

describe('checkWordReadingAlternatives', () => {
  it('succeeds if any of up to 3 alternatives matches the target', () => {
    expect(checkWordReadingAlternatives(['さかな', 'ねこ', 'いぬ'], candidates, neko)).toEqual({ outcome: 'success' })
  })

  it('is unrecognized, not scored wrong, when no alternative matches anything', () => {
    expect(checkWordReadingAlternatives(['さかな', 'とり'], candidates, neko)).toEqual({ outcome: 'unrecognized' })
  })

  it('only inspects the first 3 alternatives', () => {
    expect(checkWordReadingAlternatives(['さかな', 'とり', 'うま', 'ねこ'], candidates, neko)).toEqual({ outcome: 'unrecognized' })
  })
})
