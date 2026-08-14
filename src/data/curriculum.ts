import type { GojuonRow, ScriptCategory } from './types'

// Only one category exists so far — see docs/curriculum-extensibility.md
// for the decided (not yet implemented beyond this scaffolding) design for
// katakana/sokuon/chōon/yōon/特殊音. Every row below is tagged with this id;
// nothing else in the app should hardcode the string 'hiragana'.
export const DEFAULT_CATEGORY_ID = 'hiragana'
export const KATAKANA_CATEGORY_ID = 'katakana'
export const SOKUON_CATEGORY_ID = 'sokuon'
export const CHOUON_CATEGORY_ID = 'chouon'

export const CATEGORIES: ScriptCategory[] = [
  { id: DEFAULT_CATEGORY_ID, label: 'ひらがな', learnStyle: 'character-set' },
  // カタカナ単音 (single-kana katakana) — same 'character-set' Learn/Practice
  // shape as hiragana (flashcard -> recap -> words, all four mini-games).
  // Chosen to go first of the five planned new categories specifically
  // because it needs none of the contrast-pairs/zero-new-character
  // machinery that 促音/長音 will — see docs/curriculum-extensibility.md.
  { id: KATAKANA_CATEGORY_ID, label: 'カタカナ', learnStyle: 'character-set' },
  // 促音 (sokuon, the small-tsu gemination mark) — the first 'contrast-pairs'
  // category: Learn listens through minimal-pair WORDS (おと vs おっと)
  // instead of flashcarding っ/ッ in isolation, Tracing is word-level only,
  // and Practice drops Kana Quiz (no isolated character to quiz on in the
  // same way) — see docs/curriculum-extensibility.md and LearnPage.tsx/
  // PracticeHubPage.tsx/TracingPage.tsx, all of which branch on
  // `learnStyle` rather than special-casing this category id directly.
  {
    id: SOKUON_CATEGORY_ID,
    label: '促音',
    learnStyle: 'contrast-pairs',
    dependsOnCategoryIds: [DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID],
  },
  // 長音 (chōon, long vowels) — the second 'contrast-pairs' category, and
  // the first with NO new characters of its own: katakana's ー was already
  // taught fresh under カタカナ単音 (katakana-chouon-row), and hiragana has
  // no dedicated long-vowel glyph at all — long vowels are written by
  // repeating/combining existing vowel characters (おかあさん, せんせい,
  // とうきょう), which is exactly the nuance this lesson's minimal-pair
  // words teach. Its row's `characterIds` is therefore `[]` — see
  // docs/curriculum-extensibility.md's "Remaining structural note" and
  // curriculum.test.ts's zero-new-character coverage. Depends on both
  // hiragana and katakana for the same reason sokuon does: its words mix
  // real syllables from both scripts.
  {
    id: CHOUON_CATEGORY_ID,
    label: '長音',
    learnStyle: 'contrast-pairs',
    dependsOnCategoryIds: [DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID],
  },
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
  {
    id: 'katakana-a-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ア~オ',
    order: 0,
    characterIds: ['katakana-a', 'katakana-i', 'katakana-u', 'katakana-e', 'katakana-o'],
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
  {
    id: 'katakana-ra-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ラ~ロ',
    order: 8,
    characterIds: ['katakana-ra', 'katakana-ri', 'katakana-ru', 'katakana-re', 'katakana-ro'],
  },
  {
    id: 'katakana-wa-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ワ~ン',
    order: 9,
    characterIds: ['katakana-wa', 'katakana-wo', 'katakana-n'],
  },
  // ー (chōon/long-vowel mark) as its own small final row — see
  // characters.ts and words.ts for why it isn't folded into wa-row.
  {
    id: 'katakana-chouon-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ー',
    order: 10,
    characterIds: ['katakana-chouon'],
  },

  // ===== 促音 (sokuon) — own order sequence, starting at 0 again =====
  // A single row covering BOTH hiragana's っ and katakana's ッ together —
  // per the design, 促音 teaches the rule once, not once per script (unlike
  // hiragana/katakana above, which each get their own full row sequence).
  // See docs/curriculum-extensibility.md's "促音 (sokuon) and 長音 (chōon)"
  // section. Label is deliberately kana-only (no 促音 kanji) since RowMap
  // renders it with the hand-subsetted .font-kana font, which only ever
  // covers hiragana + katakana + ～/・ — see src/index.css's header comment.
  {
    id: 'sokuon-row',
    categoryId: SOKUON_CATEGORY_ID,
    label: 'っ・ッ',
    order: 0,
    characterIds: ['sokuon', 'katakana-sokuon'],
  },

  // ===== 長音 (chōon) — own order sequence, starting at 0 again =====
  // A single row spanning both scripts, same shape as sokuon-row above —
  // per the design, 長音 teaches the rule once, reviewing katakana's ー
  // (already taught under カタカナ単音) alongside hiragana's several
  // vowel-repetition spelling patterns, rather than a per-script lesson.
  // `characterIds: []` is deliberate, not an oversight — this row
  // introduces NO new characters (see the CHOUON_CATEGORY_ID comment
  // above); every place that reads a row's `characterIds` (Learn's
  // flashcard step, Tracing's character phase, Kana Quiz's pool) already
  // branches on `learnStyle` first and never reaches an empty-array bug
  // for a 'contrast-pairs' row — see curriculum.test.ts and
  // src/App.test.tsx's zero-new-character coverage, and
  // docs/curriculum-extensibility.md. Label is 'ー' (kana-only, matching
  // sokuon-row's convention — see its comment) even though hiragana's own
  // words in this lesson don't use that literal glyph, since ー is the
  // universally recognized long-vowel symbol and is already in the
  // font-kana subset (katakana-chouon's `kana`).
  {
    id: 'chouon-row',
    categoryId: CHOUON_CATEGORY_ID,
    label: 'ー',
    order: 0,
    characterIds: [],
  },
]

export const ROWS_BY_ID: Record<string, GojuonRow> = Object.fromEntries(
  ROWS.map((r) => [r.id, r]),
)

export function getRowOrder(rowId: string): number {
  return ROWS_BY_ID[rowId]?.order ?? -1
}

// getPreviousRowId/getNextRowId both scope their search to the SAME category
// as `rowId` — once a second category exists, its rows number their own
// `order` starting from 0 independently, so cross-category order
// comparisons would be meaningless ("next row after the last katakana row"
// isn't a question these two answer — see getNextRowId('katakana-chouon-row')
// returning null, not the first sokuon row).
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
// THE SAME CATEGORY, PLUS every character from any category explicitly
// listed in this row's category's `dependsOnCategoryIds` — i.e. the
// vocabulary/distractor-eligible character pool once that row is unlocked.
//
// This is deliberately NOT "every category declared earlier in CATEGORIES,"
// which was tried and reverted: katakana is declared after hiragana but
// doesn't depend on it (learning カ doesn't require か), and that version
// leaked all 71 hiragana characters into every katakana row's distractor
// pool — e.g. katakana-a-row's Kana Quiz could show hiragana あ as a wrong
// answer for ア. `dependsOnCategoryIds` makes each category's real
// prerequisites an explicit fact, not an accident of array order — see
// ScriptCategory's comment in data/types.ts. 促音 depends on both hiragana
// and katakana because its words genuinely mix scripts (おっと, ベッド, ...);
// katakana depends on nothing, so its pool stays katakana-only.
export function getCumulativeCharacterIds(rowId: string): string[] {
  const row = ROWS_BY_ID[rowId]
  if (!row) return []
  const dependsOnCategoryIds = new Set(CATEGORIES_BY_ID[row.categoryId]?.dependsOnCategoryIds ?? [])
  return ROWS.filter(
    (r) => (r.categoryId === row.categoryId && r.order <= row.order) || dependsOnCategoryIds.has(r.categoryId),
  ).flatMap((r) => r.characterIds)
}
