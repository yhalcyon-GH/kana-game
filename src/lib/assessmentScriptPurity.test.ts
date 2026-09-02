import { describe, expect, it } from 'vitest'
import { CHARACTERS_BY_ID, EXCLUDED_FROM_KANA_QUIZ } from '../data/characters'
import { CATEGORIES_BY_ID, ROWS, ROWS_BY_ID, SUMMARY_ROW_SOURCE_CATEGORY_IDS } from '../data/curriculum'
import { WORDS_BY_ROW } from '../data/words'
import { buildAssessmentPlan, createSeededRng } from './assessmentPlan'

function isQuizzable(id: string) {
  if (EXCLUDED_FROM_KANA_QUIZ.has(id)) return false
  const rowId = CHARACTERS_BY_ID[id]?.rowId
  return CATEGORIES_BY_ID[ROWS_BY_ID[rowId]?.categoryId ?? '']?.learnStyle !== 'contrast-pairs'
}

function buildRealPlan(script: 'hiragana' | 'katakana') {
  const summaryRowId = script === 'hiragana' ? 'hiragana-summary' : 'katakana-summary'
  const sourceCategoryIds = SUMMARY_ROW_SOURCE_CATEGORY_IDS[summaryRowId] ?? []
  const characterIds = (ROWS_BY_ID[summaryRowId]?.characterIds ?? []).filter(isQuizzable)
  const words = ROWS.filter((row) => !row.isSummary && sourceCategoryIds.includes(row.categoryId)).flatMap(
    (row) => WORDS_BY_ROW[row.id] ?? [],
  )
  return buildAssessmentPlan({ characterIds, words, rng: createSeededRng(189) })
}

describe('assessment script purity with real curriculum data', () => {
  it('Hiragana Test uses only Hiragana scope targets', () => {
    const plan = buildRealPlan('hiragana')
    for (const question of plan.questions) {
      if (question.characterId) {
        const rowId = CHARACTERS_BY_ID[question.characterId]?.rowId
        expect(ROWS_BY_ID[rowId]?.categoryId).toBe('hiragana')
      }
      if (question.word) expect(question.word.kana).not.toMatch(/[ァ-ヴー]/)
    }
  })

  it('Katakana Test uses only Katakana scope targets', () => {
    const plan = buildRealPlan('katakana')
    for (const question of plan.questions) {
      if (question.characterId) {
        const rowId = CHARACTERS_BY_ID[question.characterId]?.rowId
        expect(ROWS_BY_ID[rowId]?.categoryId).toBe('katakana')
      }
      if (question.word) expect(question.word.kana).not.toMatch(/[ぁ-ゖ]/)
    }
  })
})
