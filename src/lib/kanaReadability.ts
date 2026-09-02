import { CATEGORIES, ROWS, ROWS_BY_ID } from '../data/curriculum'
import { CHARACTERS } from '../data/characters'

// Character ids taught at or before `afterRowId`, per the app's FIXED
// category display order (CATEGORIES, e.g. hiragana -> katakana -> sokuon
// -> chōon -> yōon -> special katakana): every row belonging to a category
// earlier than `afterRowId`'s own is treated as fully taught, regardless of
// that category's own `dependsOnCategoryIds` (which exists to scope Kana
// Quiz distractor pools, not to answer "has this been introduced by now" —
// e.g. katakana declares no dependsOnCategoryIds so hiragana never leaks
// into its distractors, even though hiragana is always taught first). Rows
// within the SAME category as `afterRowId` only count up to and including
// its own `order`.
function getReadableCharacterIds(afterRowId: string): string[] {
  const row = ROWS_BY_ID[afterRowId]
  if (!row) return []
  const categoryIndex = CATEGORIES.findIndex((c) => c.id === row.categoryId)
  return ROWS.filter((r) => {
    const rCategoryIndex = CATEGORIES.findIndex((c) => c.id === r.categoryId)
    if (rCategoryIndex < categoryIndex) return true
    if (rCategoryIndex === categoryIndex) return r.order <= row.order
    return false
  }).flatMap((r) => r.characterIds)
}

// The kana STRINGS (not single characters — Yōon/Special Katakana glyphs
// are stored as combined two-glyph kana like "きゃ") taught at or before
// `afterRowId`, for readability-checking dish text against.
export function getReadableKana(afterRowId: string): Set<string> {
  const ids = getReadableCharacterIds(afterRowId)
  return new Set(ids.map((id) => CHARACTERS.find((c) => c.id === id)?.kana).filter((k): k is string => !!k))
}

// Greedy longest-match tiling of `word` against every taught kana STRING —
// needed because Yōon/Special Katakana characters combine two glyphs (e.g.
// "きゃ"), so a per-character Set membership check would wrongly reject
// "ぎゅうどん" (containing "ぎゅ") even though ぎゅ itself is taught.
export function isFullyReadable(word: string, kanaSet: Set<string>): boolean {
  const sorted = [...kanaSet].sort((a, b) => b.length - a.length)
  let i = 0
  while (i < word.length) {
    const match = sorted.find((k) => word.startsWith(k, i))
    if (!match) return false
    i += match.length
  }
  return true
}
