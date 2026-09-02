import { CATEGORIES_BY_ID, DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID, ROWS } from '../../data/curriculum'
import { EXCLUDED_FROM_KANA_QUIZ } from '../../data/characters'
import { WORDS_BY_ROW } from '../../data/words'
import type { AssessmentScope, AssessmentScript } from './types'

// Builds the script-pure character/word pool an assessment plans from —
// mirrors useCurriculum's isQuizzableCharacterId/getSimilarLettersCategoryWords
// (both React-hook-local, not importable here), restricted to real
// (non-summary, non-similar-letters) rows of exactly ONE category. Hiragana
// and katakana are both 'character-set' categories with no
// dependsOnCategoryIds (see curriculum.ts), so this never needs to reach
// into another category's rows to stay script-pure.
function isQuizzableCharacterId(id: string, categoryId: string): boolean {
  if (EXCLUDED_FROM_KANA_QUIZ.has(id)) return false
  return CATEGORIES_BY_ID[categoryId]?.learnStyle !== 'contrast-pairs'
}

export function buildAssessmentScope(script: AssessmentScript): AssessmentScope {
  const categoryId = script === 'hiragana' ? DEFAULT_CATEGORY_ID : KATAKANA_CATEGORY_ID
  const scopeRows = ROWS.filter((row) => row.categoryId === categoryId && !row.isSummary && !row.isSimilarLetters)
  const characterIds = [...new Set(scopeRows.flatMap((row) => row.characterIds))].filter((id) =>
    isQuizzableCharacterId(id, categoryId),
  )
  const words = scopeRows.flatMap((row) => WORDS_BY_ROW[row.id] ?? [])
  return { script, characterIds, words }
}
