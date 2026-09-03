import { describe, expect, it } from 'vitest'
import type { AnchorWord } from '../data/types'
import { buildAssessmentPlan, buildFinalAssessmentPlan, buildYouonSpecialAssessmentPlan, createSeededRng, type AssessmentFamily } from './assessmentPlan'

function makeWords(count: number, prefix = 'w'): AnchorWord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    kana: `かな${i}`,
    romaji: `kana${i}`,
    meaning: `meaning ${i}`,
    characterIds: [`char-${i % 20}`, `char-${(i + 7) % 20}`],
  }))
}

const CHARACTER_IDS = Array.from({ length: 46 }, (_, i) => `char-${i}`)
const WORDS = makeWords(30)

function plan(seed: number, characterIds = CHARACTER_IDS, words = WORDS) {
  return buildAssessmentPlan({ characterIds, words, rng: createSeededRng(seed) })
}

function countByFamily(questions: { family: AssessmentFamily }[]) {
  const counts: Record<AssessmentFamily, number> = { 'kana-quiz': 0, listening: 0, 'word-builder': 0, 'word-reading': 0 }
  for (const question of questions) counts[question.family]++
  return counts
}

function longestSameFamilyRun(questions: { family: AssessmentFamily }[]): number {
  let longest = 1
  let current = 1
  for (let i = 1; i < questions.length; i++) {
    if (questions[i].family === questions[i - 1].family) {
      current++
      longest = Math.max(longest, current)
    } else current = 1
  }
  return questions.length > 0 ? longest : 0
}

describe('buildAssessmentPlan', () => {
  it('produces exactly 20 questions and exactly 5 per family', () => {
    const questions = plan(1).questions
    expect(questions).toHaveLength(20)
    expect(countByFamily(questions)).toEqual({ 'kana-quiz': 5, listening: 5, 'word-builder': 5, 'word-reading': 5 })
  })

  it('covers both Kana Quiz directions across its 5 questions', () => {
    const directions = new Set(plan(1).questions.filter((q) => q.family === 'kana-quiz').map((q) => q.kanaQuizDirection))
    expect(directions).toEqual(new Set(['read', 'recall']))
  })

  it('never has a run of 3+ consecutive same-family questions', () => {
    for (let seed = 0; seed < 25; seed++) expect(longestSameFamilyRun(plan(seed).questions)).toBeLessThanOrEqual(2)
  })

  it('is deterministic for a given seed and varies across seeds', () => {
    const a = plan(42).questions
    const b = plan(42).questions
    const c = plan(43).questions
    expect(a.map((q) => [q.family, q.characterId ?? q.word?.id])).toEqual(b.map((q) => [q.family, q.characterId ?? q.word?.id]))
    expect(a.map((q) => [q.family, q.characterId ?? q.word?.id])).not.toEqual(c.map((q) => [q.family, q.characterId ?? q.word?.id]))
  })

  it('uses 15 unique word targets across all three word families when the pool is large enough', () => {
    const wordIds = plan(1).questions.filter((q) => q.word).map((q) => q.word!.id)
    expect(wordIds).toHaveLength(15)
    expect(new Set(wordIds).size).toBe(15)
  })

  it('prefers Kana Quiz targets not already covered by the selected word questions', () => {
    const words: AnchorWord[] = Array.from({ length: 15 }, (_, i) => ({
      id: `covered-${i}`,
      kana: `word${i}`,
      romaji: `word${i}`,
      meaning: `word ${i}`,
      characterIds: ['covered-a', 'covered-b'],
    }))
    const characterIds = ['covered-a', 'covered-b', 'new-1', 'new-2', 'new-3', 'new-4', 'new-5', 'new-6']
    const kanaQuizIds = buildAssessmentPlan({ characterIds, words, rng: createSeededRng(7) }).questions
      .filter((q) => q.family === 'kana-quiz')
      .map((q) => q.characterId)
    expect(kanaQuizIds).toHaveLength(5)
    expect(kanaQuizIds.every((id) => id?.startsWith('new-'))).toBe(true)
  })

  it('falls back to repeats without crashing when pools are small', () => {
    const result = plan(1, ['a', 'b'], makeWords(2))
    expect(result.questions).toHaveLength(20)
    expect(new Set(result.questions.filter((q) => q.family === 'kana-quiz').map((q) => q.characterId))).toEqual(new Set(['a', 'b']))
  })

  it('tags direction metadata correctly', () => {
    for (const question of plan(1).questions) {
      if (question.family === 'word-reading') expect(question.direction).toBe('kana-to-sound')
      if (question.family === 'listening' || question.family === 'word-builder') expect(question.direction).toBe('sound-to-kana')
      if (question.family === 'kana-quiz') {
        expect(question.direction).toBe(question.kanaQuizDirection === 'read' ? 'kana-to-sound' : 'sound-to-kana')
      }
    }
  })
})

describe('buildYouonSpecialAssessmentPlan', () => {
  const chars = ['kya', 'kyu', 'kyo', 'sha', 'shu', 'sho', 'katakana-fa', 'katakana-fi', 'katakana-she']
  const word = (id: string, characterIds: string[]) => ({ id, kana: characterIds.map((c) => c === 'katakana-fa' ? 'ファ' : 'きゃ').join(''), romaji: id, meaning: id, characterIds, image: `${id}.webp` })
  const words = Array.from({ length: 12 }, (_, i) => word(`y${i}`, [chars[i % 6]])).concat(
    Array.from({ length: 3 }, (_, i) => word(`s${i}`, [chars[6 + (i % 3)]])),
  )

  it('keeps the exact 20-question and 16/4 quotas per activity', () => {
    const plan = buildYouonSpecialAssessmentPlan({ characterIds: chars, words, rng: createSeededRng(3) })
    expect(plan.questions).toHaveLength(20)
    for (const family of ['kana-quiz', 'listening', 'word-builder', 'word-reading'] as const) {
      const questions = plan.questions.filter((q) => q.family === family)
      expect(questions).toHaveLength(5)
      expect(questions.filter((q) => q.domain === 'youon')).toHaveLength(4)
      expect(questions.filter((q) => q.domain === 'special-katakana')).toHaveLength(1)
    }
  })

  it('is deterministic for a seed and varies on retake seeds', () => {
    const a = buildYouonSpecialAssessmentPlan({ characterIds: chars, words, rng: createSeededRng(3) })
    const b = buildYouonSpecialAssessmentPlan({ characterIds: chars, words, rng: createSeededRng(3) })
    const c = buildYouonSpecialAssessmentPlan({ characterIds: chars, words, rng: createSeededRng(4) })
    expect(a).toEqual(b)
    expect(a.questions.map((q) => q.characterId ?? q.word?.id)).not.toEqual(c.questions.map((q) => q.characterId ?? q.word?.id))
  })
})

describe('buildFinalAssessmentPlan', () => {
  const chars = ['a', 'katakana-a', 'ga', 'sokuon', 'katakana-chouon', 'kya', 'katakana-fa']
  const words = Array.from({ length: 30 }, (_, i) => ({ id: `final-${i}`, kana: 'かな', romaji: `kana${i}`, meaning: 'word', characterIds: [chars[i % chars.length]], image: 'word.webp' }))
  it('creates the stratified 30-question activity mix', () => {
    const questions = buildFinalAssessmentPlan({ characterIds: chars, words, rng: createSeededRng(197) }).questions
    expect(questions).toHaveLength(30)
    expect(questions.filter((q) => q.family === 'kana-quiz')).toHaveLength(6)
    for (const family of ['listening', 'word-builder', 'word-reading'] as const) expect(questions.filter((q) => q.family === family)).toHaveLength(8)
  })
  it('is deterministic and changes on retakes', () => {
    const a = buildFinalAssessmentPlan({ characterIds: chars, words, rng: createSeededRng(1) }).questions
    const b = buildFinalAssessmentPlan({ characterIds: chars, words, rng: createSeededRng(1) }).questions
    const c = buildFinalAssessmentPlan({ characterIds: chars, words, rng: createSeededRng(2) }).questions
    expect(a).toEqual(b)
    expect(a.map((q) => q.word?.id ?? q.characterId)).not.toEqual(c.map((q) => q.word?.id ?? q.characterId))
  })
})
