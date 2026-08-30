import type { GojuonRow } from './types'

// Similar Letters — a supplementary comparison lesson for characters that
// are commonly confused BY SHAPE (unlike normal gojūon rows, which group by
// SOUND). Groups are curated by hand, in the exact order confirmed by the
// user — do NOT re-sort into gojūon/Unicode order; the whole point is that
// this order groups look-alikes together, not sound-alikes.
//
// Character ids are `characters.ts` KanaChar ids (confirmed against that
// file directly, not guessed).
export const HIRAGANA_SIMILAR_GROUPS: string[][] = [
  ['a', 'o'], // あ・お
  ['ki', 'sa', 'chi'], // き・さ・ち
  ['nu', 'me'], // ぬ・め
  ['ne', 'wa', 're'], // ね・わ・れ
  ['ha', 'ho', 'ma'], // は・ほ・ま
  ['ka', 'ya'], // か・や
  ['ru', 'ro'], // る・ろ
]

export const KATAKANA_SIMILAR_GROUPS: string[][] = [
  ['katakana-a', 'katakana-ma'], // ア・マ
  ['katakana-ta', 'katakana-ku', 'katakana-ke', 'katakana-wa'], // タ・ク・ケ・ワ
  ['katakana-me', 'katakana-na'], // メ・ナ
  ['katakana-shi', 'katakana-tsu'], // シ・ツ
  ['katakana-su', 'katakana-nu'], // ス・ヌ
  ['katakana-ka', 'katakana-ya'], // カ・ヤ
  ['katakana-ko', 'katakana-yu'], // コ・ユ
  ['katakana-so', 'katakana-ri', 'katakana-n'], // ソ・リ・ン
]

export const HIRAGANA_SIMILAR_LETTERS_ROW_ID = 'hiragana-similar-letters'
export const KATAKANA_SIMILAR_LETTERS_ROW_ID = 'katakana-similar-letters'

// A large, fixed `order` that's never adjacent to any real row's — see
// GojuonRow.isSimilarLetters's comment. getNextRowId/getPreviousRowId only
// match on `own order +/- 1` within the same category, so this can never be
// silently spliced into the real hiragana/katakana row-to-row chain (whose
// last real step is already followed by that script's own Summary row).
const SIMILAR_LETTERS_ORDER = 1000

// categoryId is filled in by curriculum.ts (which owns DEFAULT_CATEGORY_ID/
// KATAKANA_CATEGORY_ID) — see buildSimilarLettersRows below.
export function buildSimilarLettersRows(hiraganaCategoryId: string, katakanaCategoryId: string): GojuonRow[] {
  return [
    {
      id: HIRAGANA_SIMILAR_LETTERS_ROW_ID,
      categoryId: hiraganaCategoryId,
      // Visible label unified to English "Similar Letters" everywhere this
      // row's `label` is rendered (RowMap tile, hub heading, category-page
      // card) — previously showed the Japanese にてる字 in some spots and
      // the English `englishLabel` in others. Internal id/isSimilarLetters/
      // sampling/progression are untouched.
      label: 'Similar Letters',
      order: SIMILAR_LETTERS_ORDER,
      characterIds: HIRAGANA_SIMILAR_GROUPS.flat(),
      learnBatches: HIRAGANA_SIMILAR_GROUPS,
      englishLabel: 'Similar Letters',
      isSimilarLetters: true,
    },
    {
      id: KATAKANA_SIMILAR_LETTERS_ROW_ID,
      categoryId: katakanaCategoryId,
      label: 'Similar Letters',
      order: SIMILAR_LETTERS_ORDER,
      characterIds: KATAKANA_SIMILAR_GROUPS.flat(),
      learnBatches: KATAKANA_SIMILAR_GROUPS,
      englishLabel: 'Similar Letters',
      isSimilarLetters: true,
    },
  ]
}
