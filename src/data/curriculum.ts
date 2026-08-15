import type { GojuonRow, ScriptCategory } from './types'

// Only one category exists so far — see docs/curriculum-extensibility.md
// for the decided (not yet implemented beyond this scaffolding) design for
// katakana/sokuon/chōon/yōon/特殊音. Every row below is tagged with this id;
// nothing else in the app should hardcode the string 'hiragana'.
export const DEFAULT_CATEGORY_ID = 'hiragana'
export const KATAKANA_CATEGORY_ID = 'katakana'

export const CATEGORIES: ScriptCategory[] = [
  { id: DEFAULT_CATEGORY_ID, label: 'ひらがな', learnStyle: 'character-set' },
  // カタカナ単音 (single-kana katakana) — same 'character-set' Learn/Practice
  // shape as hiragana (flashcard -> recap -> words, all four mini-games).
  // Chosen to go first of the five planned new categories specifically
  // because it needs none of the contrast-pairs/zero-new-character
  // machinery that 促音/長音 will — see docs/curriculum-extensibility.md.
  { id: KATAKANA_CATEGORY_ID, label: 'カタカナ', learnStyle: 'character-set' },
]

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

  // ===== カタカナ (katakana) — own order sequence, starting at 0 again =====
  // ア~オ also carries ー (chōon) and ン here, unlike hiragana's あ行 — see
  // characters.ts's comment. Without them almost no real katakana word is
  // constructible from vowels alone (katakana's actual role is loanwords,
  // which lean heavily on ン and ー), and every later row's vocabulary
  // benefits from having both available from the very start rather than
  // waiting for a dedicated final row — see words.ts's katakana-a-row
  // comment for the vocabulary this unlocks.
  {
    id: 'katakana-a-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ア~オ・ー・ン',
    order: 0,
    characterIds: ['katakana-a', 'katakana-i', 'katakana-u', 'katakana-e', 'katakana-o', 'katakana-chouon', 'katakana-n'],
  },
  {
    id: 'katakana-ka-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'カ~コ・ガ~ゴ',
    order: 1,
    characterIds: [
      'katakana-ka', 'katakana-ki', 'katakana-ku', 'katakana-ke', 'katakana-ko',
      'katakana-ga', 'katakana-gi', 'katakana-gu', 'katakana-ge', 'katakana-go',
    ],
  },
  {
    id: 'katakana-sa-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'サ~ソ・ザ~ゾ',
    order: 2,
    characterIds: [
      'katakana-sa', 'katakana-shi', 'katakana-su', 'katakana-se', 'katakana-so',
      'katakana-za', 'katakana-ji', 'katakana-zu', 'katakana-ze', 'katakana-zo',
    ],
  },
  {
    id: 'katakana-ta-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'タ~ト・ダ~ド',
    order: 3,
    characterIds: [
      'katakana-ta', 'katakana-chi', 'katakana-tsu', 'katakana-te', 'katakana-to',
      'katakana-da', 'katakana-dji', 'katakana-dzu', 'katakana-de', 'katakana-do',
    ],
  },
  {
    id: 'katakana-na-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ナ~ノ',
    order: 4,
    characterIds: ['katakana-na', 'katakana-ni', 'katakana-nu', 'katakana-ne', 'katakana-no'],
  },
  {
    id: 'katakana-ha-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ハ~ホ・バ~ボ・パ~ポ',
    order: 5,
    characterIds: [
      'katakana-ha', 'katakana-hi', 'katakana-fu', 'katakana-he', 'katakana-ho',
      'katakana-ba', 'katakana-bi', 'katakana-bu', 'katakana-be', 'katakana-bo',
      'katakana-pa', 'katakana-pi', 'katakana-pu', 'katakana-pe', 'katakana-po',
    ],
  },
  {
    id: 'katakana-ma-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'マ~モ',
    order: 6,
    characterIds: ['katakana-ma', 'katakana-mi', 'katakana-mu', 'katakana-me', 'katakana-mo'],
  },
  {
    id: 'katakana-ya-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ヤ・ユ・ヨ',
    order: 7,
    characterIds: ['katakana-ya', 'katakana-yu', 'katakana-yo'],
  },
  // ラ~ロ・ワ・ヲ — the final katakana row, absorbing ワ/ヲ (ン already
  // moved up to ア行, above) rather than giving them their own row, since
  // they're otherwise the only two single-kana characters left without
  // one — see characters.ts's comment.
  {
    id: 'katakana-ra-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ラ~ロ・ワ・ヲ',
    order: 8,
    characterIds: ['katakana-ra', 'katakana-ri', 'katakana-ru', 'katakana-re', 'katakana-ro', 'katakana-wa', 'katakana-wo'],
  },
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
