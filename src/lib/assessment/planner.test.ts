import { describe, expect, it } from 'vitest'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID, ROWS_BY_ID } from '../../data/curriculum'
import { WORDS_BY_ROW } from '../../data/words'
import { buildAssessmentScope } from './assessmentScope'
import { ASSESSMENT_QUESTION_COUNT, buildAssessmentPlan, QUESTIONS_PER_FAMILY } from './planner'
import type { AssessmentFamily, AssessmentQuestion, AssessmentScript } from './types'

// Deterministic seeded RNG (mulberry32) so plan assertions are exact/
// reproducible rather than statistical — matches the planner's own Rng
// contract (see planner.ts's Rng comment).
function seededRng(seed: number) {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function familyCounts(questions: AssessmentQuestion[]): Record<AssessmentFamily, number> {
  const counts: Record<AssessmentFamily, number> = { 'kana-quiz': 0, listening: 0, 'word-builder': 0, 'word-reading': 0 }
  for (const q of questions) counts[q.family]++
  return counts
}

function longestSameFamilyRun(questions: AssessmentQuestion[]): number {
  let longest = 1
  let current = 1
  for (let i = 1; i < questions.length; i++) {
    current = questions[i].family === questions[i - 1].family ? current + 1 : 1
    longest = Math.max(longest, current)
  }
  return longest
}

function allCharIdsUsed(questions: AssessmentQuestion[]): string[] {
  const ids = new Set<string>()
  for (const q of questions) {
    q.coveredCharIds.forEach((id) => ids.add(id))
    if (q.family === 'kana-quiz') {
      ids.add(q.targetCharId)
      q.choiceCharIds.forEach((id) => ids.add(id))
    }
    if (q.family === 'word-builder') q.distractorCharIds.forEach((id) => ids.add(id))
  }
  return [...ids]
}

describe.each<AssessmentScript>(['hiragana', 'katakana'])('buildAssessmentPlan (%s)', (script) => {
  const scope = buildAssessmentScope(script)

  it('produces exactly 20 questions', () => {
    const questions = buildAssessmentPlan(scope, seededRng(1))
    expect(questions).toHaveLength(ASSESSMENT_QUESTION_COUNT)
  })

  it('produces exactly 5 of each family', () => {
    const questions = buildAssessmentPlan(scope, seededRng(2))
    const counts = familyCounts(questions)
    expect(counts['kana-quiz']).toBe(QUESTIONS_PER_FAMILY)
    expect(counts.listening).toBe(QUESTIONS_PER_FAMILY)
    expect(counts['word-builder']).toBe(QUESTIONS_PER_FAMILY)
    expect(counts['word-reading']).toBe(QUESTIONS_PER_FAMILY)
  })

  it('never runs 3 or more consecutive questions of the same family', () => {
    // Try several seeds — the interleave logic should hold for any rng.
    for (let seed = 0; seed < 20; seed++) {
      const questions = buildAssessmentPlan(scope, seededRng(seed))
      expect(longestSameFamilyRun(questions)).toBeLessThan(3)
    }
  })

  it('is script-pure: every character/word used belongs to this script only', () => {
    const questions = buildAssessmentPlan(scope, seededRng(3))
    const isOwnScript = (id: string) => (script === 'katakana' ? id.startsWith('katakana-') : !id.startsWith('katakana-'))

    for (const charId of allCharIdsUsed(questions)) {
      expect(CHARACTERS_BY_ID[charId]).toBeDefined()
      expect(isOwnScript(charId)).toBe(true)
    }

    for (const question of questions) {
      const wordIds: string[] =
        question.family === 'listening'
          ? question.choiceWordIds
          : question.family === 'word-reading'
            ? question.romajiChoiceWordIds
            : question.family === 'word-builder'
              ? [question.targetWordId]
              : []
      for (const wordId of wordIds) {
        const row = Object.values(WORDS_BY_ROW)
          .flat()
          .find((w) => w.id === wordId)
        expect(row).toBeDefined()
        for (const charId of row!.characterIds) {
          expect(isOwnScript(charId)).toBe(true)
        }
      }
    }
  })

  it('never repeats a target word across the whole test while unused eligible words remain', () => {
    const questions = buildAssessmentPlan(scope, seededRng(4))
    const targetWordIds = questions
      .filter((q): q is Extract<AssessmentQuestion, { targetWordId: string }> => 'targetWordId' in q)
      .map((q) => q.targetWordId)
    expect(new Set(targetWordIds).size).toBe(targetWordIds.length)
    // 15 word-based questions need 15 distinct words; the real hiragana/
    // katakana word pools are comfortably larger than that.
    expect(scope.words.length).toBeGreaterThanOrEqual(targetWordIds.length)
  })

  it('achieves broad kana coverage: word questions plus Kana Quiz targets cover most of the script', () => {
    const questions = buildAssessmentPlan(scope, seededRng(5))
    const covered = new Set<string>()
    questions.forEach((q) => q.coveredCharIds.forEach((id) => covered.add(id)))
    // 15 words (each 2+ characters) plus 5 dedicated Kana Quiz targets should
    // comfortably exceed half the script's quizzable character count.
    expect(covered.size).toBeGreaterThan(scope.characterIds.length / 2)
  })

  it('Kana Quiz choices always include the target and stay within the script pool', () => {
    const questions = buildAssessmentPlan(scope, seededRng(6))
    for (const q of questions) {
      if (q.family !== 'kana-quiz') continue
      expect(q.choiceCharIds).toContain(q.targetCharId)
      expect(new Set(q.choiceCharIds).size).toBe(q.choiceCharIds.length)
      for (const id of q.choiceCharIds) expect(scope.characterIds).toContain(id)
    }
  })

  it('is reproducible for the same rng seed', () => {
    const a = buildAssessmentPlan(scope, seededRng(42))
    const b = buildAssessmentPlan(scope, seededRng(42))
    expect(a).toEqual(b)
  })
})

describe('buildAssessmentPlan row-purity sanity', () => {
  it('hiragana scope contains no katakana rows and vice versa', () => {
    const hiragana = buildAssessmentScope('hiragana')
    const katakana = buildAssessmentScope('katakana')
    for (const id of hiragana.characterIds) expect(ROWS_BY_ID[CHARACTERS_BY_ID[id].rowId].categoryId).toBe(DEFAULT_CATEGORY_ID)
    for (const id of katakana.characterIds) expect(ROWS_BY_ID[CHARACTERS_BY_ID[id].rowId].categoryId).toBe(KATAKANA_CATEGORY_ID)
  })
})
