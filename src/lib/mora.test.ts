import { describe, expect, it } from 'vitest'
import { toMorae } from './mora'

describe('toMorae', () => {
  it('splits plain seion kana one mora per character', () => {
    expect(toMorae('さくら')).toEqual(['さ', 'く', 'ら'])
  })

  it('splits dakuten kana one mora per character', () => {
    expect(toMorae('がぎぐげご')).toEqual(['が', 'ぎ', 'ぐ', 'げ', 'ご'])
  })

  it('treats sokuon (っ) as its own mora', () => {
    expect(toMorae('がっこう')).toEqual(['が', 'っ', 'こ', 'う'])
  })

  it('treats chōon (ー) as its own mora', () => {
    expect(toMorae('コーヒー')).toEqual(['コ', 'ー', 'ヒ', 'ー'])
  })

  it('treats hatsuon (ん) as its own mora', () => {
    expect(toMorae('ほん')).toEqual(['ほ', 'ん'])
  })

  it('merges a small ゃゅょ with the preceding kana into one yōon mora', () => {
    expect(toMorae('きゃく')).toEqual(['きゃ', 'く'])
    expect(toMorae('ひゃく')).toEqual(['ひゃ', 'く'])
  })

  it('merges katakana small kana the same way', () => {
    expect(toMorae('キャット')).toEqual(['キャ', 'ッ', 'ト'])
  })

  it('returns an empty array for an empty string', () => {
    expect(toMorae('')).toEqual([])
  })
})
