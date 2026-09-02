import { describe, expect, it } from 'vitest'
import type { AnchorWord } from '../data/types'
import { buildAssessmentPlan, createSeededRng, type AssessmentFamily } from './assessmentPlan'

function makeWords(count: number, prefix = 'w'): AnchorWord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    kana: `かな${i}`,
    romaji: `kana${i}`,
    meaning: `meaning ${i}`,
    characterIds: ['ka', 'na'],
  }))
}

const CHARACTER_IDS = Array.from({ length: 46 }, (_, i) => `char-${i}`)
const WORDS = makeWords(30)

function plan(seed: number, characterIds = CHARACTER_IDS, words = WORDS) {
  return buildAssessmentPlan({ characterIds, words, rng: createSeededRng(seed) })
}

function countByFamily(questions: { family: AssessmentFamily }[]) {
  const counts: Record<AssessmentFamily, number> = { 'kana-quiz': 0, listening: 0, 'word-builder': 0, 'word-reading': 0 }
  for (const q of questions) counts[q.family]++
  return counts
}

function longestSameFamilyRun(questions: { family: AssessmentFamily }[]): number {
  let longest = 1
  let current = 1
  for (let i = 1; i < questions.length; i++) {
    if (questions[i].family === questions[i - 1].family) {
      current++
      longest = Math.max(longest, current)
    } else {
      current = 1
    }
  }
  return questions.length > 0 ? longest : 0
}

describe('buildAssessmentPlan', () => {
  it('produces exactly 20 questions', () => {
    expect(plan(1).questions).toHaveLength(20)
  })

  it('produces exactly 5 questions per family', () => {
    const counts = countByFamily(plan(1).questions)
    expect(counts).toEqual({ 'kana-quiz': 5, listening: 5, 'word-builder': 5, 'word-reading': 5 })
  })

  it('covers both Kana Quiz directions across its 5 questions', () => {
    const kanaQuizQuestions = plan(1).questions.filter((q) => q.family === 'kana-quiz')
    const directions = new Set(kanaQuizQuestions.map((q) => q.kanaQuizDirection))
    expect(directions.has('read')).toBe(true)
    expect(directions.has('recall')).toBe(true)
  })

  it('never has a run of 3+ consecutive same-family questions given ample pool size', () => {
    for (let seed = 0; seed < 25; seed++) {
      const run = longestSameFamilyRun(plan(seed).questions)
      expect(run).toBeLessThanOrEqual(2)
    }
  })

  it('is deterministic for a given seed', () => {
    const a = plan(42)
    const b = plan(42)
    expect(a.questions.map((q) => q.characterId ?? q.word?.id)).toEqual(b.questions.map((q) => q.characterId ?? q.word?.id))
    expect(a.questions.map((q) => q.family)).toEqual(b.questions.map((q) => q.family))
  })

  it('produces alternate valid target sets across different seeds (retake variety)', () => {
    const a = plan(1)
    const b = plan(2)
    const aIds = a.questions.map((q) => q.characterId ?? q.word?.id).join(',')
    const bIds = b.questions.map((q) => q.characterId ?? q.word?.id).join(',')
    expect(aIds).not.toEqual(bIds)
  })

  it('maximizes distinct kana coverage: Kana Quiz picks 5 distinct characters when pool is large', () => {
    const kanaQuizIds = plan(1).questions.filter((q) => q.family === 'kana-quiz').map((q) => q.characterId)
    expect(new Set(kanaQuizIds).size).toBe(5)
  })

  it('maximizes distinct word coverage across Listening/Word Builder/Word Reading when pool is large', () => {
    const questions = plan(1).questions
    for (const family of ['listening', 'word-builder', 'word-reading'] as const) {
      const ids = questions.filter((q) => q.family === family).map((q) => q.word?.id)
      expect(new Set(ids).size).toBe(5)
    }
  })

  it('falls back to repeats without crashing when the pool is smaller than 5', () => {
    const smallChars = ['a', 'b']
    const smallWords = makeWords(2)
    const result = plan(1, smallChars, smallWords)
    expect(result.questions).toHaveLength(20)
    const kanaQuizIds = result.questions.filter((q) => q.family === 'kana-quiz').map((q) => q.characterId)
    expect(new Set(kanaQuizIds)).toEqual(new Set(smallChars))
  })

  it('tags direction metadata correctly: kana-to-sound for Read + Word Reading, sound-to-kana for Recall + Listening + Word Builder', () => {
    const questions = plan(1).questions
    for (const q of questions) {
      if (q.family === 'word-reading') expect(q.direction).toBe('kana-to-sound')
      if (q.family === 'listening' || q.family === 'word-builder') expect(q.direction).toBe('sound-to-kana')
      if (q.family === 'kana-quiz') {
        expect(q.direction).toBe(q.kanaQuizDirection === 'read' ? 'kana-to-sound' : 'sound-to-kana')
      }
    }
  })
})
