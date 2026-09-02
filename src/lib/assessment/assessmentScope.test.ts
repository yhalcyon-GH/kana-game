import { describe, expect, it } from 'vitest'
import { EXCLUDED_FROM_KANA_QUIZ } from '../../data/characters'
import { buildAssessmentScope } from './assessmentScope'

describe('buildAssessmentScope', () => {
  it('hiragana scope is 100% hiragana characters', () => {
    const scope = buildAssessmentScope('hiragana')
    expect(scope.characterIds.length).toBeGreaterThan(0)
    expect(scope.characterIds.every((id) => !id.startsWith('katakana-'))).toBe(true)
  })

  it('katakana scope is 100% katakana characters', () => {
    const scope = buildAssessmentScope('katakana')
    expect(scope.characterIds.length).toBeGreaterThan(0)
    expect(scope.characterIds.every((id) => id.startsWith('katakana-'))).toBe(true)
  })

  it('excludes EXCLUDED_FROM_KANA_QUIZ characters (ぢ/づ and katakana ー) from the quiz pool', () => {
    const hiragana = buildAssessmentScope('hiragana')
    const katakana = buildAssessmentScope('katakana')
    for (const id of EXCLUDED_FROM_KANA_QUIZ) {
      expect(hiragana.characterIds).not.toContain(id)
      expect(katakana.characterIds).not.toContain(id)
    }
  })

  it('hiragana words only reference hiragana characters, katakana words only katakana', () => {
    const hiragana = buildAssessmentScope('hiragana')
    const katakana = buildAssessmentScope('katakana')
    expect(hiragana.words.length).toBeGreaterThan(0)
    expect(katakana.words.length).toBeGreaterThan(0)
    expect(hiragana.words.every((w) => w.characterIds.every((id) => !id.startsWith('katakana-')))).toBe(true)
    expect(katakana.words.every((w) => w.characterIds.every((id) => id.startsWith('katakana-')))).toBe(true)
  })

  it('excludes similar-letters and summary rows from the word pool', () => {
    const hiragana = buildAssessmentScope('hiragana')
    // Summary/Similar Letters words are already included in their source
    // rows, so a plain word-id count from real rows only should have no
    // duplicated ids.
    const ids = hiragana.words.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
