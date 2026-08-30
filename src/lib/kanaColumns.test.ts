import { describe, expect, it } from 'vitest'
import { groupCharactersByColumn, vowelColumn } from './kanaColumns'
import type { KanaChar } from '../data/types'

function char(id: string, kana: string, romaji: string): KanaChar {
  return { id, kana, romaji, rowId: 'test-row', type: 'base' }
}

describe('vowelColumn', () => {
  it('reads the column off the last romaji letter', () => {
    expect(vowelColumn('ka')).toBe(0)
    expect(vowelColumn('ki')).toBe(1)
    expect(vowelColumn('ku')).toBe(2)
    expect(vowelColumn('ke')).toBe(3)
    expect(vowelColumn('ko')).toBe(4)
  })

  it('gets the irregular readings right via their romaji ending', () => {
    expect(vowelColumn('shi')).toBe(1)
    expect(vowelColumn('chi')).toBe(1)
    expect(vowelColumn('tsu')).toBe(2)
    expect(vowelColumn('fu')).toBe(2)
    expect(vowelColumn('kya')).toBe(0)
    expect(vowelColumn('kyu')).toBe(2)
    expect(vowelColumn('kyo')).toBe(4)
  })

  it('returns null for characters with no column (ん, placeholder "-")', () => {
    expect(vowelColumn('n')).toBeNull()
    expect(vowelColumn('-')).toBeNull()
  })
})

describe('groupCharactersByColumn', () => {
  it('lays out a full 5-character row with no gaps', () => {
    const chars = [char('ka', 'か', 'ka'), char('ki', 'き', 'ki'), char('ku', 'く', 'ku'), char('ke', 'け', 'ke'), char('ko', 'こ', 'ko')]
    const rows = groupCharactersByColumn(chars)
    expect(rows).toEqual([{ columns: chars }])
  })

  it('leaves gaps for a partial row instead of left-packing (や/ゆ/よ)', () => {
    const ya = char('ya', 'や', 'ya')
    const yu = char('yu', 'ゆ', 'yu')
    const yo = char('yo', 'よ', 'yo')
    const rows = groupCharactersByColumn([ya, yu, yo])
    expect(rows).toEqual([{ columns: [ya, null, yu, null, yo] }])
  })

  it('starts a new line for a new dakuten group instead of continuing the base one', () => {
    const ka = char('ka', 'か', 'ka')
    const ko = char('ko', 'こ', 'ko')
    const ga = char('ga', 'が', 'ga')
    const go = char('go', 'ご', 'go')
    const rows = groupCharactersByColumn([ka, ko, ga, go])
    expect(rows).toEqual([{ columns: [ka, null, null, null, ko] }, { columns: [ga, null, null, null, go] }])
  })

  it('collects consecutive no-column characters (ん, ー) into their own line', () => {
    const wa = char('wa', 'わ', 'wa')
    const n = char('n', 'ん', 'n')
    const chouon = char('chouon', 'ー', '-')
    const rows = groupCharactersByColumn([wa, n, chouon])
    expect(rows).toEqual([{ columns: [wa, null, null, null, null] }, { other: [n, chouon] }])
  })
})
