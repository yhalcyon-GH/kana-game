import type { GojuonRow, ScriptCategory } from './types'

// Only one category exists so far — see docs/curriculum-extensibility.md
// for the decided (not yet implemented beyond this scaffolding) design for
// katakana/sokuon/chōon/yōon/特殊音. Every row below is tagged with this id;
// nothing else in the app should hardcode the string 'hiragana'.
export const DEFAULT_CATEGORY_ID = 'hiragana'

export const CATEGORIES: ScriptCategory[] = [{ id: DEFAULT_CATEGORY_ID, label: 'ひらがな', learnStyle: 'character-set' }]

export const CATEGORIES_BY_ID: Record<string, ScriptCategory> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

// Row order defines the curriculum sequence. Dakuten/handakuten rows are
// folded into their base row's lesson (see characters.ts) rather than
// appearing as separate rows, per the "teach voiced sounds together with
// their base row" design decision. `order` is scoped WITHIN a category
// (see getCumulativeCharacterIds etc. below) — a second category starts
// its own ordering from 0, independent of this one.
export const ROWS: GojuonRow[] = [
  { id: 'a-row', categoryId: DEFAULT_CATEGORY_ID, label: 'あ~お', order: 0, characterIds: ['a', 'i', 'u', 'e', 'o'] },
  {
    id: 'ka-row',
    categoryId: DEFAULT_CATEGORY_ID,
    label: 'か~こ・が~ご',
    order: 1,
    characterIds: ['ka', 'ki', 'ku', 'ke', 'ko', 'ga', 'gi', 'gu', 'ge', 'go'],
  },
  {
    id: 'sa-row',
    categoryId: DEFAULT_CATEGORY_ID,
    label: 'さ~そ・ざ~ぞ',
    order: 2,
    characterIds: ['sa', 'shi', 'su', 'se', 'so', 'za', 'ji', 'zu', 'ze', 'zo'],
  },
  {
    id: 'ta-row',
    categoryId: DEFAULT_CATEGORY_ID,
    label: 'た~と・だ~ど',
    order: 3,
    characterIds: ['ta', 'chi', 'tsu', 'te', 'to', 'da', 'dji', 'dzu', 'de', 'do'],
  },
  { id: 'na-row', categoryId: DEFAULT_CATEGORY_ID, label: 'な~の', order: 4, characterIds: ['na', 'ni', 'nu', 'ne', 'no'] },
  {
    id: 'ha-row',
    categoryId: DEFAULT_CATEGORY_ID,
    label: 'は~ほ・ば~ぼ・ぱ~ぽ',
    order: 5,
    characterIds: [
      'ha', 'hi', 'fu', 'he', 'ho',
      'ba', 'bi', 'bu', 'be', 'bo',
      'pa', 'pi', 'pu', 'pe', 'po',
    ],
  },
  { id: 'ma-row', categoryId: DEFAULT_CATEGORY_ID, label: 'ま~も', order: 6, characterIds: ['ma', 'mi', 'mu', 'me', 'mo'] },
  { id: 'ya-row', categoryId: DEFAULT_CATEGORY_ID, label: 'や・ゆ・よ', order: 7, characterIds: ['ya', 'yu', 'yo'] },
  { id: 'ra-row', categoryId: DEFAULT_CATEGORY_ID, label: 'ら~ろ', order: 8, characterIds: ['ra', 'ri', 'ru', 're', 'ro'] },
  { id: 'wa-row', categoryId: DEFAULT_CATEGORY_ID, label: 'わ~ん', order: 9, characterIds: ['wa', 'wo', 'n'] },
]

export const ROWS_BY_ID: Record<string, GojuonRow> = Object.fromEntries(
  ROWS.map((r) => [r.id, r]),
)

export function getRowOrder(rowId: string): number {
  return ROWS_BY_ID[rowId]?.order ?? -1
}

// These three all scope their search to the SAME category as `rowId` — once
// a second category exists, its rows number their own `order` starting
// from 0 independently, so cross-category order comparisons would be
// meaningless (and cross-category "cumulative characters" would be wrong:
// katakana isn't a prerequisite pool for a hiragana word's distractors).
export function getPreviousRowId(rowId: string): string | null {
  const row = ROWS_BY_ID[rowId]
  if (!row) return null
  return ROWS.find((r) => r.categoryId === row.categoryId && r.order === row.order - 1)?.id ?? null
}

export function getNextRowId(rowId: string): string | null {
  const row = ROWS_BY_ID[rowId]
  if (!row) return null
  return ROWS.find((r) => r.categoryId === row.categoryId && r.order === row.order + 1)?.id ?? null
}

// All character ids introduced at or before the given row (inclusive) WITHIN
// THE SAME CATEGORY, i.e. the vocabulary-eligible character pool once that
// row is unlocked.
export function getCumulativeCharacterIds(rowId: string): string[] {
  const row = ROWS_BY_ID[rowId]
  if (!row) return []
  return ROWS.filter((r) => r.categoryId === row.categoryId && r.order <= row.order).flatMap((r) => r.characterIds)
}
