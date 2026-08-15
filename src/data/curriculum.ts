import type { GojuonRow, ScriptCategory } from './types'

// Five categories exist (hiragana/katakana/sokuon/chōon/yōon) — see
// docs/curriculum-extensibility.md for the full design and its "Progress"
// section for how each landed. A sixth, 特殊音 (tokushuon, extended katakana
// loanword digraphs like ファ/ティ/ヴ), was built and shipped once, then
// deliberately removed at the user's request ("特殊音は今回なくていいです")
// — the content isn't needed for this curriculum right now. Every row below
// is tagged with a categoryId; nothing else in the app should hardcode the
// string 'hiragana'.
export const DEFAULT_CATEGORY_ID = 'hiragana'
export const KATAKANA_CATEGORY_ID = 'katakana'
export const SOKUON_CATEGORY_ID = 'sokuon'
export const CHOUON_CATEGORY_ID = 'chouon'
export const YOUON_CATEGORY_ID = 'youon'

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
    explanation:
      'Sokuon is a short pause before certain consonants, written as a small っ/ッ. It briefly holds the sound and can completely change a word\'s meaning — compare each pair below with and without it.',
  },
  // 長音 (chōon, long vowels) — the second 'contrast-pairs' category, and
  // the first with NO new characters of its own: katakana's ー was already
  // taught fresh under カタカナ単音 (katakana-a-row), and hiragana has no
  // dedicated long-vowel glyph at all — long vowels are written by
  // repeating/combining existing vowel characters (おかあさん, せんせい,
  // とうきょう). Every row's `characterIds` is therefore `[]` — see
  // docs/curriculum-extensibility.md's "Remaining structural note" and
  // curriculum.test.ts's zero-new-character coverage. Depends on both
  // hiragana and katakana for the same reason sokuon does: its words mix
  // real syllables from both scripts (but NOT yōon — see the chouon rows'
  // comment below for why that matters).
  //
  // Unlike sokuon (one rule, one row), 長音 genuinely has 5 different
  // hiragana spelling rules depending on which vowel column precedes the
  // long vowel — per the user's own teaching material (see below) each gets
  // its own row so the rule can be taught (and reviewed via a row-level
  // `explanation`) one at a time, plus a 6th row reviewing katakana's ー.
  {
    id: CHOUON_CATEGORY_ID,
    label: '長音',
    learnStyle: 'contrast-pairs',
    dependsOnCategoryIds: [DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID],
    explanation:
      'Chōon means a "long vowel" — a vowel sound held for an extra beat. Katakana always spells it with ー, but hiragana has no dedicated mark: it spells a long vowel by repeating or extending the vowel that comes before it, and exactly how depends on which vowel that is. Each row below covers one of those rules.',
  },
  // 拗音 (yōon, contracted sounds like きゃ/kya) — back to 'character-set'
  // (flashcard -> recap -> words, all four mini-games), same shape as
  // hiragana/katakana, NOT 'contrast-pairs' like sokuon/chōon — see
  // docs/curriculum-extensibility.md. Depends on both hiragana and katakana
  // for the same reason sokuon/chōon do: real yōon vocabulary freely mixes
  // in already-taught plain kana (きゃく uses きゃ + く, ミャンマー uses
  // ミャ + ン + マ + ー) alongside its own new characters — it does NOT
  // need `dependsOnCategoryIds` to include sokuon/chōon too: content here
  // was deliberately written to avoid っ/ッ/ー-requiring words needing the
  // sokuon category specifically (ー itself is fine — it's a KATAKANA
  // category character, not sokuon/chōon), keeping this category's
  // prerequisites simple and explicit rather than accreting every prior
  // category "just in case".
  {
    id: YOUON_CATEGORY_ID,
    label: '拗音',
    learnStyle: 'character-set',
    dependsOnCategoryIds: [DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID],
    explanation:
      'Yōon are contracted sounds made from a consonant + い kana (き/し/ち/に/ひ/み/り, or their voiced forms) followed by a small ゃ/ゅ/ょ. Two characters, but only ONE syllable — きゃ isn\'t "ki-ya", it\'s one quick "kya".',
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
  // ア~オ・カ~ゴ・ー・ン are all one combined first lesson, at the user's
  // explicit request: ア~オ alone (even with ー/ン) has no consonant to
  // build real vocabulary from, so the first lesson bundles in カ~ゴ too —
  // see characters.ts's comment and words.ts's katakana-a-row word list
  // (merged from the former separate a-row/ka-row lists, still valid since
  // both drew from exactly this same combined character pool already).
  {
    id: 'katakana-a-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ア~オ・カ~ゴ・ン・ー',
    order: 0,
    characterIds: [
      'katakana-a', 'katakana-i', 'katakana-u', 'katakana-e', 'katakana-o',
      'katakana-ka', 'katakana-ki', 'katakana-ku', 'katakana-ke', 'katakana-ko',
      'katakana-ga', 'katakana-gi', 'katakana-gu', 'katakana-ge', 'katakana-go',
      'katakana-n', 'katakana-chouon',
    ],
  },
  {
    id: 'katakana-sa-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'サ~ソ・ザ~ゾ',
    order: 1,
    characterIds: [
      'katakana-sa', 'katakana-shi', 'katakana-su', 'katakana-se', 'katakana-so',
      'katakana-za', 'katakana-ji', 'katakana-zu', 'katakana-ze', 'katakana-zo',
    ],
  },
  {
    id: 'katakana-ta-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'タ~ト・ダ~ド',
    order: 2,
    characterIds: [
      'katakana-ta', 'katakana-chi', 'katakana-tsu', 'katakana-te', 'katakana-to',
      'katakana-da', 'katakana-dji', 'katakana-dzu', 'katakana-de', 'katakana-do',
    ],
  },
  {
    id: 'katakana-na-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ナ~ノ',
    order: 3,
    characterIds: ['katakana-na', 'katakana-ni', 'katakana-nu', 'katakana-ne', 'katakana-no'],
  },
  {
    id: 'katakana-ha-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ハ~ホ・バ~ボ・パ~ポ',
    order: 4,
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
    order: 5,
    characterIds: ['katakana-ma', 'katakana-mi', 'katakana-mu', 'katakana-me', 'katakana-mo'],
  },
  {
    id: 'katakana-ya-row',
    categoryId: KATAKANA_CATEGORY_ID,
    label: 'ヤ・ユ・ヨ',
    order: 6,
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
    order: 7,
    characterIds: ['katakana-ra', 'katakana-ri', 'katakana-ru', 'katakana-re', 'katakana-ro', 'katakana-wa', 'katakana-wo'],
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
  // Six rows, all spanning both scripts and all with `characterIds: []`
  // (deliberate, not an oversight — see the CHOUON_CATEGORY_ID comment
  // above; every place that reads a row's `characterIds` already branches
  // on `learnStyle` first, see curriculum.test.ts / App.test.tsx). Rows 0-4
  // are hiragana's 5 vowel-column long-vowel rules — per the user's own
  // teaching material, each vowel column spells a long vowel differently,
  // so each gets its own row + `explanation` rather than one lesson
  // covering all 5 at once:
  //   ①ア段 -> +あ   ②イ段 -> +い   ③ウ段 -> +う
  //   ④エ段 -> +い (exception: real え, e.g. おねえさん)
  //   ⑤オ段 -> +う (exception: real お, e.g. とおい/おおきい/こおり/...)
  // Row 5 reviews katakana's ー (already taught under カタカナ単音) — no
  // rule to teach there, katakana is always ー regardless of vowel.
  //
  // Every word in every row below uses ONLY hiragana + katakana characters
  // (this category's actual dependsOnCategoryIds), never yōon combinations
  // (きょ/しゅ/...) even where the source material's own examples used them
  // (e.g. とうきょう, ぎゅうにゅう) — chōon does not depend on the yōon
  // category, and yōon is now its own separate top-level page that a
  // learner may not have reached yet, so pulling in its characters here
  // would either violate curriculum.test.ts's "words only use characters
  // introduced before this row" check or silently assume an ordering the
  // page structure no longer guarantees. Labels are kana-only (vowel + ー,
  // e.g. 'あー') per RowMap's font-kana subset (hiragana + katakana + ～/・
  // only, no kanji — see index.css) — 段/行 aren't in it.
  {
    id: 'chouon-a-row',
    categoryId: CHOUON_CATEGORY_ID,
    label: 'あー',
    order: 0,
    characterIds: [],
    explanation: '①ア段 (a-column): a long vowel after an あ-row sound is written by adding あ. E.g. おかあさん (mother) — compare おばさん (aunt, no long vowel) with おばあさん (grandmother, long vowel).',
  },
  {
    id: 'chouon-i-row',
    categoryId: CHOUON_CATEGORY_ID,
    label: 'いー',
    order: 1,
    characterIds: [],
    explanation: '②イ段 (i-column): a long vowel after an い-row sound is written by adding い. E.g. おじさん (uncle, no long vowel) vs. おじいさん (grandfather, long vowel).',
  },
  {
    id: 'chouon-u-row',
    categoryId: CHOUON_CATEGORY_ID,
    label: 'うー',
    order: 2,
    characterIds: [],
    explanation: '③ウ段 (u-column): a long vowel after a う-row sound is written by adding う. E.g. ゆうき (courage).',
  },
  {
    id: 'chouon-e-row',
    categoryId: CHOUON_CATEGORY_ID,
    label: 'えー',
    order: 3,
    characterIds: [],
    explanation: '④エ段 (e-column): a long vowel after an え-row sound is usually written with い, not え — e.g. えいが (movie). The big exception: おねえさん (older sister) really is spelled with え.',
  },
  {
    id: 'chouon-o-row',
    categoryId: CHOUON_CATEGORY_ID,
    label: 'おー',
    order: 4,
    characterIds: [],
    explanation: '⑤オ段 (o-column): a long vowel after an お-row sound is usually written with う, not お — e.g. おはよう (good morning). But several common words really are spelled with お: おおきい (big), とおい (far), こおり (ice), and a few more — these just have to be memorized.',
  },
  {
    id: 'chouon-katakana-row',
    categoryId: CHOUON_CATEGORY_ID,
    label: 'ー',
    order: 5,
    characterIds: [],
    explanation: 'Katakana never has this problem — a long vowel is always written with ー, no matter which vowel it follows. Compare ビル (building, no long vowel) with ビール (beer, long vowel).',
  },

  // ===== 拗音 (yōon) — own order sequence, starting at 0 again =====
  // Unlike sokuon/chōon (one combined row for both scripts, since those
  // teach a single rule), yōon has real per-consonant-group structure worth
  // multiple rows on each script, like hiragana/katakana's own rows do — but
  // 拗音 is still ONE category (per docs/curriculum-extensibility.md's
  // ScriptCategory id list), and `order` is scoped per-category, not
  // per-script-within-a-category — there's no schema support for two
  // independent order-0 sequences inside one category (getNextRowId/
  // getCumulativeCharacterIds only filter by categoryId+order). So this is
  // ONE monotonic order sequence (0-13) split into two back-to-back blocks:
  // all 7 hiragana yōon rows first (order 0-6, mirroring the same
  // か/さ/た/な/は/ま/ら consonant order hiragana's own rows use — や/わ are
  // skipped since neither combines with ゃゅょ), then all 7 katakana yōon
  // rows (order 7-13). This is a judgment call, not a spec requirement —
  // teaching hiragana's full yōon set before starting katakana's mirrors
  // how the rest of the curriculum already treats the two scripts as
  // separate large blocks (all of hiragana, THEN all of katakana), rather
  // than interleaving corresponding hiragana/katakana rows lesson-by-lesson.
  // Each row folds its dakuten/handakuten combos in together, exactly like
  // ka-row/sa-row/ta-row/ha-row already do for the base gojūon (きゃ行 +
  // ぎゃ行 taught together, etc.) — see characters.ts's comment for why
  // ぢゃ行 doesn't exist as a row.
  {
    id: 'youon-ka-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'きゃ・きゅ・きょ・ぎゃ・ぎゅ・ぎょ',
    order: 0,
    characterIds: ['kya', 'kyu', 'kyo', 'gya', 'gyu', 'gyo'],
  },
  {
    id: 'youon-sha-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'しゃ・しゅ・しょ・じゃ・じゅ・じょ',
    order: 1,
    characterIds: ['sha', 'shu', 'sho', 'ja', 'ju', 'jo'],
  },
  {
    id: 'youon-cha-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'ちゃ・ちゅ・ちょ',
    order: 2,
    characterIds: ['cha', 'chu', 'cho'],
  },
  {
    id: 'youon-na-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'にゃ・にゅ・にょ',
    order: 3,
    characterIds: ['nya', 'nyu', 'nyo'],
  },
  {
    id: 'youon-ha-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'ひゃ・ひゅ・ひょ・びゃ・びゅ・びょ・ぴゃ・ぴゅ・ぴょ',
    order: 4,
    characterIds: ['hya', 'hyu', 'hyo', 'bya', 'byu', 'byo', 'pya', 'pyu', 'pyo'],
  },
  {
    id: 'youon-ma-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'みゃ・みゅ・みょ',
    order: 5,
    characterIds: ['mya', 'myu', 'myo'],
  },
  {
    id: 'youon-ra-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'りゃ・りゅ・りょ',
    order: 6,
    characterIds: ['rya', 'ryu', 'ryo'],
  },
  {
    id: 'youon-katakana-ka-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'キャ・キュ・キョ・ギャ・ギュ・ギョ',
    order: 7,
    characterIds: ['katakana-kya', 'katakana-kyu', 'katakana-kyo', 'katakana-gya', 'katakana-gyu', 'katakana-gyo'],
  },
  {
    id: 'youon-katakana-sha-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'シャ・シュ・ショ・ジャ・ジュ・ジョ',
    order: 8,
    characterIds: ['katakana-sha', 'katakana-shu', 'katakana-sho', 'katakana-ja', 'katakana-ju', 'katakana-jo'],
  },
  {
    id: 'youon-katakana-cha-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'チャ・チュ・チョ',
    order: 9,
    characterIds: ['katakana-cha', 'katakana-chu', 'katakana-cho'],
  },
  {
    id: 'youon-katakana-na-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'ニャ・ニュ・ニョ',
    order: 10,
    characterIds: ['katakana-nya', 'katakana-nyu', 'katakana-nyo'],
  },
  {
    id: 'youon-katakana-ha-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'ヒャ・ヒュ・ヒョ・ビャ・ビュ・ビョ・ピャ・ピュ・ピョ',
    order: 11,
    characterIds: [
      'katakana-hya', 'katakana-hyu', 'katakana-hyo',
      'katakana-bya', 'katakana-byu', 'katakana-byo',
      'katakana-pya', 'katakana-pyu', 'katakana-pyo',
    ],
  },
  {
    id: 'youon-katakana-ma-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'ミャ・ミュ・ミョ',
    order: 12,
    characterIds: ['katakana-mya', 'katakana-myu', 'katakana-myo'],
  },
  {
    id: 'youon-katakana-ra-row',
    categoryId: YOUON_CATEGORY_ID,
    label: 'リャ・リュ・リョ',
    order: 13,
    characterIds: ['katakana-rya', 'katakana-ryu', 'katakana-ryo'],
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
// isn't a question these two answer — see getNextRowId('katakana-ra-row')
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
