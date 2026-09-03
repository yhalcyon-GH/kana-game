import { describe, expect, it } from 'vitest'
import type { AnchorWord } from '../data/types'
import { checkWordReading, checkWordReadingAlternatives } from './wordReadingMatching'

const SAKANA: AnchorWord = { id: 'w-sakana', kana: 'さかな', romaji: 'sakana', meaning: 'fish', characterIds: ['sa', 'ka', 'na'] }

describe('checkWordReading', () => {
  it('succeeds on an exact match', () => {
    expect(checkWordReading('さかな', SAKANA)).toEqual({ outcome: 'success' })
  })

  it('succeeds when transcript has extra trailing content', () => {
    expect(checkWordReading('さかなです', SAKANA)).toEqual({ outcome: 'success' })
  })

  it('succeeds across katakana/hiragana folding', () => {
    expect(checkWordReading('サカナ', SAKANA)).toEqual({ outcome: 'success' })
  })

  it('accepts safe romaji case, spacing, and hyphen variation', () => {
    expect(checkWordReading('SA-KA NA', SAKANA)).toEqual({ outcome: 'success' })
  })

  it('accepts the word audio text as a common recognition form', () => {
    const oneesan = { ...SAKANA, kana: 'おねえさん', romaji: 'oneesan', audioText: 'お姉さん' }
    expect(checkWordReading('お姉さん', oneesan)).toEqual({ outcome: 'success' })
  })

  it('is incorrect for a different real word', () => {
    expect(checkWordReading('いぬ', SAKANA)).toEqual({ outcome: 'incorrect' })
  })

  it('is unrecognized for an empty transcript', () => {
    expect(checkWordReading('', SAKANA)).toEqual({ outcome: 'unrecognized' })
  })
})

describe('checkWordReadingAlternatives', () => {
  it('succeeds if any of up to 3 alternatives matches', () => {
    expect(checkWordReadingAlternatives(['いぬ', 'さかな', 'ねこ'], SAKANA)).toEqual({ outcome: 'success' })
  })

  it('is incorrect when none match but at least one was recognized speech', () => {
    expect(checkWordReadingAlternatives(['いぬ', 'ねこ'], SAKANA)).toEqual({ outcome: 'incorrect' })
  })

  it('is unrecognized when given no alternatives', () => {
    expect(checkWordReadingAlternatives([], SAKANA)).toEqual({ outcome: 'unrecognized' })
  })
})
