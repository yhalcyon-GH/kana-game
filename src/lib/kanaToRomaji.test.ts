import { describe, expect, it } from 'vitest'
import { kanaToRomaji } from './kanaToRomaji'

describe('kanaToRomaji', () => {
  it('converts a plain hiragana word', () => {
    expect(kanaToRomaji('あさ')).toBe('asa')
  })

  it('converts a plain katakana word', () => {
    expect(kanaToRomaji('コンビニ')).toBe('konbini')
  })

  it('prefers the longer (2-glyph, yōon) match over two 1-glyph matches', () => {
    expect(kanaToRomaji('きゃく')).toBe('kyaku')
  })

  it('passes through unrecognized text unchanged', () => {
    expect(kanaToRomaji('abc')).toBe('abc')
  })

  it('handles an empty string', () => {
    expect(kanaToRomaji('')).toBe('')
  })
})
