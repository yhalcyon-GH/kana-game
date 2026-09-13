import { CHARACTERS_BY_ID } from '../data/characters'
import { CATEGORIES_BY_ID, ROWS_BY_ID } from '../data/curriculum'
import { WORDS_BY_ROW } from '../data/words'

function resolveRowSourceCategory(rowId: string): string | undefined {
  const categoryId = ROWS_BY_ID[rowId]?.categoryId
  return categoryId && CATEGORIES_BY_ID[categoryId] ? categoryId : undefined
}

/**
 * Resolves a character's source through the canonical character -> row ->
 * category relationships. Unknown or malformed relationships have no source.
 */
export function resolveCharacterSourceCategory(characterId: string): string | undefined {
  const rowId = CHARACTERS_BY_ID[characterId]?.rowId
  return rowId ? resolveRowSourceCategory(rowId) : undefined
}

/**
 * Resolves a word's source exclusively from canonical WORDS_BY_ROW
 * membership. A word that occurs in more than one row is intentionally
 * ambiguous, even if those rows currently share a category, and is denied by
 * consumers rather than being guessed.
 */
export function resolveWordSourceCategory(wordId: string): string | undefined {
  const matchingRowIds = Object.entries(WORDS_BY_ROW)
    .filter(([, words]) => words.some((word) => word.id === wordId))
    .map(([rowId]) => rowId)

  if (matchingRowIds.length !== 1) return undefined
  return resolveRowSourceCategory(matchingRowIds[0])
}
