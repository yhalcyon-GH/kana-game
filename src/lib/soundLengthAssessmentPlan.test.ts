import { describe, expect, it } from 'vitest'
import { WORDS_BY_ROW } from '../data/words'
import { buildSoundLengthAssessmentPlan, createSoundLengthRng } from './soundLengthAssessmentPlan'

describe('sound-length assessment plan', () => {
  const words = Object.entries(WORDS_BY_ROW).filter(([rowId]) => rowId === 'sokuon-row' || rowId.startsWith('chouon-')).flatMap(([, rowWords]) => rowWords)
  it('builds the required mixed 5/10/5 assessment deterministically', () => {
    const first = buildSoundLengthAssessmentPlan(words, createSoundLengthRng(42))
    const second = buildSoundLengthAssessmentPlan(words, createSoundLengthRng(42))
    expect(first).toEqual(second)
    expect(first.questions).toHaveLength(20)
    expect(first.questions.filter((q) => q.domain === 'sokuon')).toHaveLength(5)
    expect(first.questions.filter((q) => q.domain === 'long-vowel')).toHaveLength(10)
    expect(first.questions.filter((q) => q.domain === 'no-insertion')).toHaveLength(5)
    expect(first.questions.filter((q) => q.correct === '×')).toHaveLength(5)
    expect(new Set(first.questions.map((q) => q.word.id)).size).toBe(20)
    for (let i = 2; i < first.questions.length; i++) {
      expect(new Set(first.questions.slice(i - 2, i + 1).map((q) => q.domain)).size).toBeGreaterThan(1)
    }
  })

  it('keeps orthography-specific choices live', () => {
    const questions = buildSoundLengthAssessmentPlan(words, createSoundLengthRng(7)).questions
    for (const question of questions) {
      expect(question.choices).toContain(question.correct)
      if (question.domain === 'sokuon') expect(question.choices).toContain(question.correct)
      if (question.diagnostic === 'katakana-chouon') expect(question.choices).toContain('ー')
      if (question.domain === 'no-insertion') {
        expect(question.correct).toBe('×')
        expect(question.prompt.replace('□', '')).toBe(question.word.kana)
      }
      if (question.word.id === 'chouon-e-oneesan') expect(question.choices).toEqual(expect.arrayContaining(['い', 'え']))
      if (question.word.id === 'chouon-o-ookii') expect(question.choices).toEqual(expect.arrayContaining(['う', 'お']))
    }
  })
})
