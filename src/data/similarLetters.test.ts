import { describe, expect, it } from 'vitest'
import { CHARACTERS_BY_ID } from './characters'
import { HIRAGANA_SIMILAR_GROUPS, KATAKANA_SIMILAR_GROUPS } from './similarLetters'

const HIRAGANA_EXPECTED = [
  ['あ', 'お'],
  ['き', 'さ', 'ち'],
  ['ぬ', 'め'],
  ['ね', 'わ', 'れ'],
  ['は', 'ほ', 'ま'],
  ['か', 'や'],
  ['る', 'ろ'],
]

const KATAKANA_EXPECTED = [
  ['ア', 'マ'],
  ['タ', 'ク', 'ケ', 'ワ'],
  ['メ', 'ナ'],
  ['シ', 'ツ'],
  ['ス', 'ヌ'],
  ['カ', 'ヤ'],
  ['コ', 'ユ'],
  ['ソ', 'リ', 'ン'],
]

function idsToKana(groups: string[][]): string[][] {
  return groups.map((g) => g.map((id) => CHARACTERS_BY_ID[id]?.kana))
}

describe('Similar Letters confusion groups', () => {
  it('every character id used exists in characters.ts', () => {
    for (const id of [...HIRAGANA_SIMILAR_GROUPS.flat(), ...KATAKANA_SIMILAR_GROUPS.flat()]) {
      expect(CHARACTERS_BY_ID[id], `unknown character id "${id}"`).toBeDefined()
    }
  })

  it('hiragana has exactly the 7 confirmed groups, in the confirmed order — not gojūon-sorted', () => {
    expect(HIRAGANA_SIMILAR_GROUPS).toHaveLength(7)
    expect(idsToKana(HIRAGANA_SIMILAR_GROUPS)).toEqual(HIRAGANA_EXPECTED)
  })

  it('katakana has exactly the 8 confirmed groups, in the confirmed order — not gojūon-sorted', () => {
    expect(KATAKANA_SIMILAR_GROUPS).toHaveLength(8)
    expect(idsToKana(KATAKANA_SIMILAR_GROUPS)).toEqual(KATAKANA_EXPECTED)
  })

  it('no duplicate character across hiragana groups', () => {
    const flat = HIRAGANA_SIMILAR_GROUPS.flat()
    expect(new Set(flat).size).toBe(flat.length)
  })

  it('no duplicate character across katakana groups', () => {
    const flat = KATAKANA_SIMILAR_GROUPS.flat()
    expect(new Set(flat).size).toBe(flat.length)
  })

  it('hiragana groups contain exactly the 17 specified target characters, no more/fewer', () => {
    const expectedKana = ['あ', 'お', 'き', 'さ', 'ち', 'ぬ', 'め', 'ね', 'わ', 'れ', 'は', 'ほ', 'ま', 'か', 'や', 'る', 'ろ']
    const actualKana = HIRAGANA_SIMILAR_GROUPS.flat().map((id) => CHARACTERS_BY_ID[id].kana)
    expect(actualKana.sort()).toEqual([...expectedKana].sort())
  })

  it('katakana groups contain exactly the 19 specified target characters, no more/fewer', () => {
    const expectedKana = [
      'ア', 'マ', 'タ', 'ク', 'ケ', 'ワ', 'メ', 'ナ', 'シ', 'ツ', 'ス', 'ヌ', 'カ', 'ヤ', 'コ', 'ユ', 'ソ', 'リ', 'ン',
    ]
    const actualKana = KATAKANA_SIMILAR_GROUPS.flat().map((id) => CHARACTERS_BY_ID[id].kana)
    expect(actualKana.sort()).toEqual([...expectedKana].sort())
  })

  it('each character appears exactly once across all groups of its script', () => {
    for (const id of HIRAGANA_SIMILAR_GROUPS.flat()) {
      const count = HIRAGANA_SIMILAR_GROUPS.flat().filter((x) => x === id).length
      expect(count, `"${id}" should appear exactly once`).toBe(1)
    }
    for (const id of KATAKANA_SIMILAR_GROUPS.flat()) {
      const count = KATAKANA_SIMILAR_GROUPS.flat().filter((x) => x === id).length
      expect(count, `"${id}" should appear exactly once`).toBe(1)
    }
  })
})
