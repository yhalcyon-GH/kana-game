import { describe, expect, it } from 'vitest'
import { WORDS_BY_ROW } from '../data/words'
import { buildSoundLengthAssessmentPlan, createSoundLengthRng } from './soundLengthAssessmentPlan'

describe('sound-length assessment plan', () => {
  const words = Object.entries(WORDS_BY_ROW).filter(([rowId]) => rowId === 'sokuon-row' || rowId.startsWith('chouon-')).flatMap(([, rowWords]) => rowWords)

  function questionsAcrossSeeds() {
    const byWordId = new Map<string, ReturnType<typeof buildSoundLengthAssessmentPlan>['questions'][number]>()
    for (let seed = 0; seed < 250 && byWordId.size < words.length; seed++) {
      for (const question of buildSoundLengthAssessmentPlan(words, createSoundLengthRng(seed)).questions) {
        byWordId.set(question.word.id, question)
      }
    }
    return byWordId
  }
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

  it.each([
    ['chouon-i-ojisan', 'おじ□さん', '×', 'no-insertion'],
    ['chouon-i-ojiisan', 'おじ□さん', 'い', 'long-vowel'],
    ['chouon-a-obasan', 'おば□さん', '×', 'no-insertion'],
    ['chouon-a-obaasan', 'おば□さん', 'あ', 'long-vowel'],
    ['sokuon-oto', 'お□と', '×', 'no-insertion'],
    ['sokuon-otto', 'お□と', 'っ', 'sokuon'],
    ['sokuon-kako', 'か□こ', '×', 'no-insertion'],
    ['sokuon-kakko', 'か□こ', 'っ', 'sokuon'],
    ['chouon-katakana-biru', 'ビ□ル', '×', 'no-insertion'],
    ['chouon-katakana-biiru', 'ビ□ル', 'ー', 'long-vowel'],
    ['chouon-o-ohayou', 'おはよ□', 'う', 'long-vowel'],
    ['chouon-e-oneesan', 'おね□さん', 'え', 'long-vowel'],
  ] as const)('uses the explicit spelling decision for %s', (id, prompt, correct, domain) => {
    const question = questionsAcrossSeeds().get(id)
    expect(question).toMatchObject({ prompt, correct, domain })
  })

  it('covers every registered Sound Length word with an internally valid explicit decision', () => {
    const questions = questionsAcrossSeeds()
    expect([...questions.keys()].sort()).toEqual(words.map((word) => word.id).sort())

    for (const word of words) {
      const question = questions.get(word.id)!
      if (question.correct === '×') {
        expect(question.prompt.replace('□', '')).toBe(word.kana)
      } else {
        expect(question.prompt.replace('□', question.correct)).toBe(word.kana)
      }
    }
  })

  it('always includes the direct contrast choice for every no-insertion word', () => {
    const expectedContrastChoiceById: Record<string, string> = {
      'sokuon-oto': 'っ',
      'sokuon-kako': 'っ',
      'sokuon-katakana-bagu': 'ッ',
      'sokuon-kite': 'っ',
      'sokuon-mate': 'っ',
      'sokuon-mote': 'っ',
      'sokuon-iki': 'っ',
      'sokuon-machi': 'っ',
      'chouon-a-obasan': 'あ',
      'chouon-i-ojisan': 'い',
      'chouon-katakana-biru': 'ー',
    }
    const seen = new Set<string>()

    for (let seed = 0; seed < 250; seed++) {
      for (const question of buildSoundLengthAssessmentPlan(words, createSoundLengthRng(seed)).questions) {
        const contrastChoice = expectedContrastChoiceById[question.word.id]
        if (!contrastChoice) continue
        seen.add(question.word.id)
        expect(question.correct).toBe('×')
        expect(question.choices).toContain('×')
        expect(question.choices).toContain(contrastChoice)
      }
    }

    expect([...seen].sort()).toEqual(Object.keys(expectedContrastChoiceById).sort())
  })

  it('fails closed when Sound Length vocabulary is added without an explicit decision spec', () => {
    expect(() => buildSoundLengthAssessmentPlan([
      ...words,
      { id: 'new-unmapped-word', kana: 'てすと', romaji: 'tesuto', meaning: 'test', characterIds: ['te', 'su', 'to'] },
    ], createSoundLengthRng(1))).toThrow(/explicit Sound Length spec.*new-unmapped-word/i)
  })
})
