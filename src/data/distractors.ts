// Visually/phonetically confusable character pairs, used to pick tougher
// distractors in the listening game than pure random choice would give.
// Keys and values are KanaChar ids from characters.ts.
// The table is symmetric by convention (if A lists B, B lists A) but each
// entry is written out explicitly rather than derived, so it stays easy to
// scan and edit as content grows.
export const CONFUSABLE_PAIRS: Record<string, string[]> = {
  // the classic "loopy squiggle" cluster
  nu: ['me', 'wa', 're', 'ne'],
  me: ['nu', 'wa', 're', 'ne'],
  wa: ['nu', 'me', 're', 'ne'],
  re: ['nu', 'me', 'wa', 'ne'],
  ne: ['nu', 'me', 'wa', 're'],

  ru: ['ro'],
  ro: ['ru', 'so'],
  so: ['ro'],

  sa: ['ki', 'chi'],
  ki: ['sa', 'chi'],
  chi: ['sa', 'ki'],

  ha: ['ho', 'ma'],
  ho: ['ha'],
  ma: ['ha'],

  u: ['ra'],
  ra: ['u'],

  ni: ['ko'],
  ko: ['ni'],

  ta: ['na'],
  na: ['ta'],

  ku: ['ke'],
  ke: ['ku'],

  // dakuten/handakuten confusions (same base shape, easy to mis-hear/mis-read)
  ba: ['pa'],
  pa: ['ba'],
  bi: ['pi'],
  pi: ['bi'],
  bu: ['pu'],
  pu: ['bu'],
  be: ['pe'],
  pe: ['be'],
  bo: ['po'],
  po: ['bo'],

  // katakana — shape confusions specific to that script (different glyphs
  // than the hiragana pairs above, so listed separately)
  'katakana-shi': ['katakana-tsu'],
  'katakana-tsu': ['katakana-shi', 'katakana-sokuon'],
  'katakana-so': ['katakana-n'],
  'katakana-n': ['katakana-so', 'katakana-wa'],
  'katakana-wa': ['katakana-n'],

  // katakana dakuten/handakuten confusions (same shape logic as hiragana above)
  'katakana-ba': ['katakana-pa'],
  'katakana-pa': ['katakana-ba'],
  'katakana-bi': ['katakana-pi'],
  'katakana-pi': ['katakana-bi'],
  'katakana-bu': ['katakana-pu'],
  'katakana-pu': ['katakana-bu'],
  'katakana-be': ['katakana-pe'],
  'katakana-pe': ['katakana-be'],
  'katakana-bo': ['katakana-po'],
  'katakana-po': ['katakana-bo'],

  // small-vs-full-size kana confusions: っ/ッ (sokuon) are literally a
  // smaller-printed つ/ツ, the single easiest thing to mix up once both
  // exist in the same word pool (see curriculum-extensibility.md's sokuon
  // section). katakana-tsu's entry above already carries the katakana half
  // of this (merged there instead of duplicated, since that key already
  // existed for the shi/tsu shape confusion).
  sokuon: ['tsu'],
  tsu: ['sokuon'],
  'katakana-sokuon': ['katakana-tsu'],

  // 拗音 (yōon) dakuten/handakuten confusions — same shape logic as the
  // ba/pa-style entries above, just for the contracted forms.
  kya: ['gya'],
  gya: ['kya'],
  kyu: ['gyu'],
  gyu: ['kyu'],
  kyo: ['gyo'],
  gyo: ['kyo'],
  sha: ['ja'],
  ja: ['sha'],
  shu: ['ju'],
  ju: ['shu'],
  sho: ['jo'],
  jo: ['sho'],
  hya: ['bya', 'pya'],
  bya: ['hya', 'pya'],
  pya: ['hya', 'bya'],
  hyu: ['byu', 'pyu'],
  byu: ['hyu', 'pyu'],
  pyu: ['hyu', 'byu'],
  hyo: ['byo', 'pyo'],
  byo: ['hyo', 'pyo'],
  pyo: ['hyo', 'byo'],
  'katakana-kya': ['katakana-gya'],
  'katakana-gya': ['katakana-kya'],
  'katakana-kyu': ['katakana-gyu'],
  'katakana-gyu': ['katakana-kyu'],
  'katakana-kyo': ['katakana-gyo'],
  'katakana-gyo': ['katakana-kyo'],
  'katakana-sha': ['katakana-ja'],
  'katakana-ja': ['katakana-sha'],
  'katakana-shu': ['katakana-ju'],
  'katakana-ju': ['katakana-shu'],
  'katakana-sho': ['katakana-jo'],
  'katakana-jo': ['katakana-sho'],
  'katakana-hya': ['katakana-bya', 'katakana-pya'],
  'katakana-bya': ['katakana-hya', 'katakana-pya'],
  'katakana-pya': ['katakana-hya', 'katakana-bya'],
  'katakana-hyu': ['katakana-byu', 'katakana-pyu'],
  'katakana-byu': ['katakana-hyu', 'katakana-pyu'],
  'katakana-pyu': ['katakana-hyu', 'katakana-byu'],
  'katakana-hyo': ['katakana-byo', 'katakana-pyo'],
  'katakana-byo': ['katakana-hyo', 'katakana-pyo'],
  'katakana-pyo': ['katakana-hyo', 'katakana-byo'],

  // 特殊音 (tokushuon) confusions. Voiced/voiceless pairs, same shape as the
  // ba/pa-style entries above: ティ/ディ and トゥ/ドゥ differ only by a
  // dakuten. va/vi/ve/vo/vu vs ba/bi/be/bo/bu is the genuinely hard one for
  // a learner — the v/b distinction barely exists in Japanese phonology, so
  // ヴ-row characters are easy to misread as their b-row look/sound-alikes.
  'katakana-ti': ['katakana-di'],
  'katakana-di': ['katakana-ti'],
  'katakana-tu': ['katakana-du'],
  'katakana-du': ['katakana-tu'],
  'katakana-va': ['katakana-ba'],
  'katakana-vi': ['katakana-bi'],
  'katakana-ve': ['katakana-be'],
  'katakana-vo': ['katakana-bo'],
  'katakana-vu': ['katakana-bu'],
}

export function getConfusableIds(charId: string): string[] {
  return CONFUSABLE_PAIRS[charId] ?? []
}
