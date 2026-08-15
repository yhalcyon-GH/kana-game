import type { AnchorWord } from './types'

// Word lists, one array per row. Every word here uses ONLY characters
// introduced at or before that row (validated by data/curriculum.test.ts)
// so the vocabulary and kana knowledge grow together. Each row's full list
// is shown together in the row's "Step B: words" screen, and doubles as the
// word pool the practice mini-games draw from — there's no separate
// teach-only vs practice-only split, since Step B already shows every word
// for the row at once (unlike a per-character drip-feed).
//
// Special case: を is a grammatical particle that essentially never appears
// inside a standalone Japanese word, so its row (wa-row) includes one short
// phrase (みずをのむ) instead of a single word to demonstrate real usage.
//
// `audioText`, where present, is what's actually sent to TTS instead of
// `kana` — bare hiragana is lexically ambiguous (no word boundaries, no way
// to tell a word from a same-spelled homophone), which both COEIROINK and
// ElevenLabs can mispronounce (wrong accent, wrong word split, or — for は
// read as a topic-marker particle — wrong sound entirely). Spelling it the
// way it's actually written (kanji, or katakana for animal/loanword nouns)
// resolves this, since it's the form the models' training data is
// dominated by. Left unset where the word has no natural non-kana spelling.
export const WORDS_BY_ROW: Record<string, AnchorWord[]> = {
  'a-row': [
    { id: 'a-ai', kana: 'あい', romaji: 'ai', meaning: 'love', image: 'word-icons/a-ai.webp', characterIds: ['a', 'i'], audioText: '愛' },
    { id: 'a-ie', kana: 'いえ', romaji: 'ie', meaning: 'house', image: 'word-icons/a-ie.webp', characterIds: ['i', 'e'], audioText: '家' },
    { id: 'a-ue', kana: 'うえ', romaji: 'ue', meaning: 'up / above', image: 'word-icons/a-ue.webp', characterIds: ['u', 'e'], audioText: '上' },
    { id: 'a-ao', kana: 'あお', romaji: 'ao', meaning: 'blue', image: 'word-icons/a-ao.webp', characterIds: ['a', 'o'], audioText: '青' },
  ],
  'ka-row': [
    { id: 'ka-aka', kana: 'あか', romaji: 'aka', meaning: 'red', image: 'word-icons/ka-aka.webp', characterIds: ['a', 'ka'], audioText: '赤' },
    { id: 'ka-kao', kana: 'かお', romaji: 'kao', meaning: 'face', image: 'word-icons/ka-kao.webp', characterIds: ['ka', 'o'], audioText: '顔' },
    { id: 'ka-ika', kana: 'いか', romaji: 'ika', meaning: 'squid', image: 'word-icons/ka-ika.webp', characterIds: ['i', 'ka'], audioText: 'イカ' },
    { id: 'ka-kagi', kana: 'かぎ', romaji: 'kagi', meaning: 'key', image: 'word-icons/ka-kagi.webp', characterIds: ['ka', 'gi'], audioText: '鍵' },
    { id: 'ka-koko', kana: 'ここ', romaji: 'koko', meaning: 'here', image: 'word-icons/ka-koko.webp', characterIds: ['ko', 'ko'] },
    { id: 'ka-gogo', kana: 'ごご', romaji: 'gogo', meaning: 'afternoon', image: 'word-icons/ka-gogo.webp', characterIds: ['go', 'go'], audioText: '午後' },
    { id: 'ka-kau', kana: 'かう', romaji: 'kau', meaning: 'to buy', image: 'word-icons/ka-kau.webp', characterIds: ['ka', 'u'], audioText: '買う' },
    { id: 'ka-kiku', kana: 'きく', romaji: 'kiku', meaning: 'to listen', image: 'word-icons/ka-kiku.webp', characterIds: ['ki', 'ku'], audioText: '聞く' },
    { id: 'ka-eki', kana: 'えき', romaji: 'eki', meaning: 'station', image: 'word-icons/ka-eki.webp', characterIds: ['e', 'ki'], audioText: '駅' },
    { id: 'ka-gaikoku', kana: 'がいこく', romaji: 'gaikoku', meaning: 'foreign country', image: 'word-icons/ka-gaikoku.webp', characterIds: ['ga', 'i', 'ko', 'ku'], audioText: '外国' },
  ],
  'sa-row': [
    { id: 'sa-asa', kana: 'あさ', romaji: 'asa', meaning: 'morning', image: 'word-icons/sa-asa.webp', characterIds: ['a', 'sa'], audioText: '朝' },
    { id: 'sa-isu', kana: 'いす', romaji: 'isu', meaning: 'chair', image: 'word-icons/sa-isu.webp', characterIds: ['i', 'su'], audioText: '椅子' },
    { id: 'sa-kasa', kana: 'かさ', romaji: 'kasa', meaning: 'umbrella', image: 'word-icons/sa-kasa.webp', characterIds: ['ka', 'sa'], audioText: '傘' },
    { id: 'sa-suki', kana: 'すき', romaji: 'suki', meaning: 'to like', image: 'word-icons/sa-suki.webp', characterIds: ['su', 'ki'], audioText: '好き' },
    { id: 'sa-sekai', kana: 'せかい', romaji: 'sekai', meaning: 'world', image: 'word-icons/sa-sekai.webp', characterIds: ['se', 'ka', 'i'], audioText: '世界' },
    { id: 'sa-kazu', kana: 'かず', romaji: 'kazu', meaning: 'number', image: 'word-icons/sa-kazu.webp', characterIds: ['ka', 'zu'], audioText: '数' },
    { id: 'sa-okashi', kana: 'おかし', romaji: 'okashi', meaning: 'snack', image: 'word-icons/sa-okashi.webp', characterIds: ['o', 'ka', 'shi'], audioText: 'お菓子' },
    { id: 'sa-sake', kana: 'さけ', romaji: 'sake', meaning: 'sake (alcohol)', image: 'word-icons/sa-sake.webp', characterIds: ['sa', 'ke'], audioText: 'お酒' },
    { id: 'sa-sushi', kana: 'すし', romaji: 'sushi', meaning: 'sushi', image: 'word-icons/sa-sushi.webp', characterIds: ['su', 'shi'], audioText: '寿司' },
  ],
  'ta-row': [
    { id: 'ta-te', kana: 'て', romaji: 'te', meaning: 'hand', image: 'word-icons/ta-te.webp', characterIds: ['te'], audioText: '手' },
    { id: 'ta-kutsu', kana: 'くつ', romaji: 'kutsu', meaning: 'shoes', image: 'word-icons/ta-kutsu.webp', characterIds: ['ku', 'tsu'], audioText: '靴' },
    { id: 'ta-ito', kana: 'いと', romaji: 'ito', meaning: 'thread', image: 'word-icons/ta-ito.webp', characterIds: ['i', 'to'], audioText: '糸' },
    { id: 'ta-chizu', kana: 'ちず', romaji: 'chizu', meaning: 'map', image: 'word-icons/ta-chizu.webp', characterIds: ['chi', 'zu'], audioText: '地図' },
    { id: 'ta-tako', kana: 'たこ', romaji: 'tako', meaning: 'octopus', image: 'word-icons/ta-tako.webp', characterIds: ['ta', 'ko'], audioText: 'タコ' },
    { id: 'ta-tsuki', kana: 'つき', romaji: 'tsuki', meaning: 'moon', image: 'word-icons/ta-tsuki.webp', characterIds: ['tsu', 'ki'], audioText: '月' },
    { id: 'ta-soto', kana: 'そと', romaji: 'soto', meaning: 'outside', image: 'word-icons/ta-soto.webp', characterIds: ['so', 'to'], audioText: '外' },
    { id: 'ta-uta', kana: 'うた', romaji: 'uta', meaning: 'song', image: 'word-icons/ta-uta.webp', characterIds: ['u', 'ta'], audioText: '歌' },
    { id: 'ta-shigoto', kana: 'しごと', romaji: 'shigoto', meaning: 'job / work', image: 'word-icons/ta-shigoto.webp', characterIds: ['shi', 'go', 'to'], audioText: '仕事' },
    { id: 'ta-chikatetsu', kana: 'ちかてつ', romaji: 'chikatetsu', meaning: 'subway', image: 'word-icons/ta-chikatetsu.webp', characterIds: ['chi', 'ka', 'te', 'tsu'], audioText: '地下鉄' },
  ],
  'na-row': [
    { id: 'na-neko', kana: 'ねこ', romaji: 'neko', meaning: 'cat', image: 'word-icons/na-neko.webp', characterIds: ['ne', 'ko'], audioText: '猫' },
    { id: 'na-inu', kana: 'いぬ', romaji: 'inu', meaning: 'dog', image: 'word-icons/na-inu.webp', characterIds: ['i', 'nu'], audioText: '犬' },
    { id: 'na-sakana', kana: 'さかな', romaji: 'sakana', meaning: 'fish', image: 'word-icons/na-sakana.webp', characterIds: ['sa', 'ka', 'na'], audioText: '魚' },
    { id: 'na-natsu', kana: 'なつ', romaji: 'natsu', meaning: 'summer', image: 'word-icons/na-natsu.webp', characterIds: ['na', 'tsu'], audioText: '夏' },
    { id: 'na-nani', kana: 'なに', romaji: 'nani', meaning: 'what', image: 'word-icons/na-nani.webp', characterIds: ['na', 'ni'], audioText: '何' },
    { id: 'na-kuni', kana: 'くに', romaji: 'kuni', meaning: 'country', image: 'word-icons/na-kuni.webp', characterIds: ['ku', 'ni'], audioText: '国' },
    { id: 'na-okane', kana: 'おかね', romaji: 'okane', meaning: 'money', image: 'word-icons/na-okane.webp', characterIds: ['o', 'ka', 'ne'], audioText: 'お金' },
    { id: 'na-niku', kana: 'にく', romaji: 'niku', meaning: 'meat', image: 'word-icons/na-niku.webp', characterIds: ['ni', 'ku'], audioText: '肉' },
  ],
  'ha-row': [
    { id: 'ha-hana', kana: 'はな', romaji: 'hana', meaning: 'flower', image: 'word-icons/ha-hana.webp', characterIds: ['ha', 'na'], audioText: '花' },
    { id: 'ha-hito', kana: 'ひと', romaji: 'hito', meaning: 'person', image: 'word-icons/ha-hito.webp', characterIds: ['hi', 'to'], audioText: '人' },
    { id: 'ha-hoshi', kana: 'ほし', romaji: 'hoshi', meaning: 'star', image: 'word-icons/ha-hoshi.webp', characterIds: ['ho', 'shi'], audioText: '星' },
    { id: 'ha-kutsushita', kana: 'くつした', romaji: 'kutsushita', meaning: 'socks', image: 'word-icons/ha-kutsushita.webp', characterIds: ['ku', 'tsu', 'shi', 'ta'], audioText: '靴下' },
    { id: 'ha-fune', kana: 'ふね', romaji: 'fune', meaning: 'boat', image: 'word-icons/ha-fune.webp', characterIds: ['fu', 'ne'], audioText: '船' },
    { id: 'ha-buta', kana: 'ぶた', romaji: 'buta', meaning: 'pig', image: 'word-icons/ha-buta.webp', characterIds: ['bu', 'ta'], audioText: '豚' },
    { id: 'ha-haha', kana: 'はは', romaji: 'haha', meaning: 'mother', image: 'word-icons/ha-haha.webp', characterIds: ['ha', 'ha'], audioText: '母' },
    { id: 'ha-hebi', kana: 'へび', romaji: 'hebi', meaning: 'snake', image: 'word-icons/ha-hebi.webp', characterIds: ['he', 'bi'], audioText: '蛇' },
    { id: 'ha-soba', kana: 'そば', romaji: 'soba', meaning: 'soba noodles', image: 'word-icons/ha-soba.webp', characterIds: ['so', 'ba'], audioText: '蕎麦' },
  ],
  'ma-row': [
    { id: 'ma-mizu', kana: 'みず', romaji: 'mizu', meaning: 'water', image: 'word-icons/ma-mizu.webp', characterIds: ['mi', 'zu'], audioText: '水' },
    { id: 'ma-ame', kana: 'あめ', romaji: 'ame', meaning: 'rain', image: 'word-icons/ma-ame.webp', characterIds: ['a', 'me'], audioText: '雨' },
    { id: 'ma-kumo', kana: 'くも', romaji: 'kumo', meaning: 'cloud', image: 'word-icons/ma-kumo.webp', characterIds: ['ku', 'mo'], audioText: '雲' },
    { id: 'ma-mado', kana: 'まど', romaji: 'mado', meaning: 'window', image: 'word-icons/ma-mado.webp', characterIds: ['ma', 'do'], audioText: '窓' },
    { id: 'ma-mimi', kana: 'みみ', romaji: 'mimi', meaning: 'ear', image: 'word-icons/ma-mimi.webp', characterIds: ['mi', 'mi'], audioText: '耳' },
    { id: 'ma-tamago', kana: 'たまご', romaji: 'tamago', meaning: 'egg', image: 'word-icons/ma-tamago.webp', characterIds: ['ta', 'ma', 'go'], audioText: '卵' },
    { id: 'ma-kudamono', kana: 'くだもの', romaji: 'kudamono', meaning: 'fruit', image: 'word-icons/ma-kudamono.webp', characterIds: ['ku', 'da', 'mo', 'no'], audioText: '果物' },
    { id: 'ma-namae', kana: 'なまえ', romaji: 'namae', meaning: 'name', image: 'word-icons/ma-namae.webp', characterIds: ['na', 'ma', 'e'], audioText: '名前' },
    { id: 'ma-nezumi', kana: 'ねずみ', romaji: 'nezumi', meaning: 'mouse', image: 'word-icons/ma-nezumi.webp', characterIds: ['ne', 'zu', 'mi'], audioText: 'ネズミ' },
    { id: 'ma-megane', kana: 'めがね', romaji: 'megane', meaning: 'glasses', image: 'word-icons/ma-megane.webp', characterIds: ['me', 'ga', 'ne'], audioText: '眼鏡' },
    { id: 'ma-tomodachi', kana: 'ともだち', romaji: 'tomodachi', meaning: 'friend', image: 'word-icons/ma-tomodachi.webp', characterIds: ['to', 'mo', 'da', 'chi'], audioText: '友達' },
    { id: 'ma-sashimi', kana: 'さしみ', romaji: 'sashimi', meaning: 'sashimi', image: 'word-icons/ma-sashimi.webp', characterIds: ['sa', 'shi', 'mi'], audioText: '刺身' },
  ],
  'ya-row': [
    { id: 'ya-yama', kana: 'やま', romaji: 'yama', meaning: 'mountain', image: 'word-icons/ya-yama.webp', characterIds: ['ya', 'ma'], audioText: '山' },
    { id: 'ya-yuki', kana: 'ゆき', romaji: 'yuki', meaning: 'snow', image: 'word-icons/ya-yuki.webp', characterIds: ['yu', 'ki'], audioText: '雪' },
    { id: 'ya-yasai', kana: 'やさい', romaji: 'yasai', meaning: 'vegetable', image: 'word-icons/ya-yasai.webp', characterIds: ['ya', 'sa', 'i'], audioText: '野菜' },
    { id: 'ya-yume', kana: 'ゆめ', romaji: 'yume', meaning: 'dream', image: 'word-icons/ya-yume.webp', characterIds: ['yu', 'me'], audioText: '夢' },
    { id: 'ya-oyogu', kana: 'およぐ', romaji: 'oyogu', meaning: 'to swim', image: 'word-icons/ya-oyogu.webp', characterIds: ['o', 'yo', 'gu'], audioText: '泳ぐ' },
    { id: 'ya-hayai', kana: 'はやい', romaji: 'hayai', meaning: 'fast', image: 'word-icons/ya-hayai.webp', characterIds: ['ha', 'ya', 'i'], audioText: '速い' },
    { id: 'ya-okonomiyaki', kana: 'おこのみやき', romaji: 'okonomiyaki', meaning: 'okonomiyaki (savory pancake)', image: 'word-icons/ya-okonomiyaki.webp', characterIds: ['o', 'ko', 'no', 'mi', 'ya', 'ki'], audioText: 'お好み焼き' },
    { id: 'ya-takoyaki', kana: 'たこやき', romaji: 'takoyaki', meaning: 'takoyaki (octopus balls)', image: 'word-icons/ya-takoyaki.webp', characterIds: ['ta', 'ko', 'ya', 'ki'], audioText: 'たこ焼き' },
  ],
  'ra-row': [
    { id: 'ra-sakura', kana: 'さくら', romaji: 'sakura', meaning: 'cherry blossom', image: 'word-icons/ra-sakura.webp', characterIds: ['sa', 'ku', 'ra'], audioText: '桜' },
    { id: 'ra-kuruma', kana: 'くるま', romaji: 'kuruma', meaning: 'car', image: 'word-icons/ra-kuruma.webp', characterIds: ['ku', 'ru', 'ma'], audioText: '車' },
    { id: 'ra-tori', kana: 'とり', romaji: 'tori', meaning: 'bird', image: 'word-icons/ra-tori.webp', characterIds: ['to', 'ri'], audioText: '鳥' },
    { id: 'ra-iro', kana: 'いろ', romaji: 'iro', meaning: 'color', image: 'word-icons/ra-iro.webp', characterIds: ['i', 'ro'], audioText: '色' },
    { id: 'ra-shiro', kana: 'しろ', romaji: 'shiro', meaning: 'white', image: 'word-icons/ra-shiro.webp', characterIds: ['shi', 'ro'], audioText: '白' },
    { id: 'ra-sora', kana: 'そら', romaji: 'sora', meaning: 'sky', image: 'word-icons/ra-sora.webp', characterIds: ['so', 'ra'], audioText: '空' },
    { id: 'ra-yoru', kana: 'よる', romaji: 'yoru', meaning: 'night', image: 'word-icons/ra-yoru.webp', characterIds: ['yo', 'ru'], audioText: '夜' },
    { id: 'ra-karaage', kana: 'からあげ', romaji: 'karaage', meaning: 'fried chicken', image: 'word-icons/ra-karaage.webp', characterIds: ['ka', 'ra', 'a', 'ge'], audioText: '唐揚げ' },
    { id: 'ra-misoshiru', kana: 'みそしる', romaji: 'misoshiru', meaning: 'miso soup', image: 'word-icons/ra-misoshiru.webp', characterIds: ['mi', 'so', 'shi', 'ru'], audioText: '味噌汁' },
    { id: 'ra-onigiri', kana: 'おにぎり', romaji: 'onigiri', meaning: 'rice ball', image: 'word-icons/ra-onigiri.webp', characterIds: ['o', 'ni', 'gi', 'ri'] },
  ],
  'wa-row': [
    { id: 'wa-watashi', kana: 'わたし', romaji: 'watashi', meaning: 'I / me', image: 'word-icons/wa-watashi.webp', characterIds: ['wa', 'ta', 'shi'], audioText: '私' },
    { id: 'wa-hon', kana: 'ほん', romaji: 'hon', meaning: 'book', image: 'word-icons/wa-hon.webp', characterIds: ['ho', 'n'], audioText: '本' },
    { id: 'wa-nihon', kana: 'にほん', romaji: 'nihon', meaning: 'Japan', image: 'word-icons/wa-nihon.webp', characterIds: ['ni', 'ho', 'n'], audioText: '日本' },
    { id: 'wa-en', kana: 'えん', romaji: 'en', meaning: 'yen', image: 'word-icons/wa-en.webp', characterIds: ['e', 'n'], audioText: '円' },
    {
      id: 'wa-mizu-wo-nomu',
      kana: 'みずをのむ',
      romaji: 'mizu wo nomu',
      meaning: 'drink water (phrase — を is a particle, not part of a word)',
      image: 'word-icons/wa-mizu-wo-nomu.webp',
      characterIds: ['mi', 'zu', 'wo', 'no', 'mu'],
      audioText: '水を飲む',
    },
    { id: 'wa-niwatori', kana: 'にわとり', romaji: 'niwatori', meaning: 'chicken (bird)', image: 'word-icons/wa-niwatori.webp', characterIds: ['ni', 'wa', 'to', 'ri'] },
    { id: 'wa-kanpai', kana: 'かんぱい', romaji: 'kanpai', meaning: 'cheers', image: 'word-icons/wa-kanpai.webp', characterIds: ['ka', 'n', 'pa', 'i'], audioText: '乾杯' },
    { id: 'wa-tenpura', kana: 'てんぷら', romaji: 'tenpura', meaning: 'tempura', image: 'word-icons/wa-tenpura.webp', characterIds: ['te', 'n', 'pu', 'ra'], audioText: '天ぷら' },
    { id: 'wa-tonkatsu', kana: 'とんかつ', romaji: 'tonkatsu', meaning: 'pork cutlet', image: 'word-icons/wa-tonkatsu.webp', characterIds: ['to', 'n', 'ka', 'tsu'], audioText: '豚カツ' },
  ],

  // ===== カタカナ (katakana) vocabulary =====
  // Same "only characters introduced at or before this row" rule as
  // hiragana above, scoped within the katakana category (see
  // getCumulativeCharacterIds in curriculum.ts). Unlike hiragana, these are
  // real loanwords/proper nouns/foreign-origin animal names — katakana's
  // actual real-world role — not native Japanese vocabulary respelled into
  // katakana. `image` is deliberately omitted for every entry here: no
  // illustration set exists yet for katakana content (see AnchorWord.image's
  // comment in types.ts and WordImage.tsx for the placeholder shown instead)
  // — this is a known, flagged gap, not an oversight.
  //
  // ー (chōon) and ン (n) are taught in katakana-a-row itself (unlike
  // hiragana's あ行, and unlike this category's own earlier drafts, which
  // gave them their own late/final rows), and katakana-a-row also bundles
  // in カ~ゴ (also unlike hiragana, and unlike an earlier draft that kept
  // ア~オ as its own thin first row) — see curriculum.ts's ROWS comment.
  // Real katakana vocabulary leans heavily on ー/ン, and ア~オ alone has no
  // consonant to build ordinary loanwords from at all, so the merged first
  // lesson is the row every later row's richness was already assuming; its
  // real depth comes from カ~ゴ (ケーキ, アイコン, エアコン, ...).
  //
  // No katakana word anywhere in this category duplicates a hiragana
  // word's MEANING (e.g. katakana イカ/squid was removed since hiragana's
  // か-row already has いか; katakana タコ/octopus removed since hiragana's
  // た-row already has たこ) — a real-world concept taught twice under two
  // different spellings would just be confusing, not reinforcing, for a
  // beginner who doesn't yet know the two scripts are different words for
  // the same thing. Check any new katakana word against the full hiragana
  // list in this file before adding it.
  //
  // katakana-ra-row's characters include ワ and ヲ (absorbed here as the
  // final row, rather than getting their own row — see curriculum.ts). ワ
  // gets real vocabulary (ワニ); ヲ does not, and never will: modern
  // Japanese never actually writes the を particle in katakana even inside
  // all-katakana text (particles stay hiragana), so there's no authentic
  // word or phrase to demonstrate here without reaching for obscure
  // pre-1946 orthography. ヲ is still taught as a character (Learn
  // flashcard, stroke order) for structural completeness with hiragana's
  // を, it just has no vocabulary reinforcement — flagged for review.
  'katakana-a-row': [
    // イオン/エイ/エイエイオー/オーイ/アイアイ/イカ were all removed at the
    // user's request: the first four as unnatural (abstract brand/
    // chemistry term, an animal name, two interjections), and アイアイ/イカ
    // specifically because katakana content shouldn't duplicate a word
    // already taught in hiragana (いか/squid already exists in hiragana's
    // か-row) — same reasoning applied category-wide, see this section's
    // header comment above and た行's note below (たこ/octopus).
    { id: 'katakana-a-kaki', kana: 'カキ', romaji: 'kaki', meaning: 'oyster', characterIds: ['katakana-ka', 'katakana-ki'] },
    { id: 'katakana-a-keeki', kana: 'ケーキ', romaji: 'keeki', meaning: 'cake', characterIds: ['katakana-ke', 'katakana-chouon', 'katakana-ki'] },
    { id: 'katakana-a-koin', kana: 'コイン', romaji: 'koin', meaning: 'coin', characterIds: ['katakana-ko', 'katakana-i', 'katakana-n'] },
    { id: 'katakana-a-aikon', kana: 'アイコン', romaji: 'aikon', meaning: 'icon (e.g. an app icon)', characterIds: ['katakana-a', 'katakana-i', 'katakana-ko', 'katakana-n'] },
    { id: 'katakana-a-eakon', kana: 'エアコン', romaji: 'eakon', meaning: 'air conditioner', characterIds: ['katakana-e', 'katakana-a', 'katakana-ko', 'katakana-n'] },
    { id: 'katakana-a-kiui', kana: 'キウイ', romaji: 'kiui', meaning: 'kiwi (fruit or bird)', characterIds: ['katakana-ki', 'katakana-u', 'katakana-i'] },
    { id: 'katakana-a-kokoa', kana: 'ココア', romaji: 'kokoa', meaning: 'cocoa', characterIds: ['katakana-ko', 'katakana-ko', 'katakana-a'] },
    { id: 'katakana-a-kakao', kana: 'カカオ', romaji: 'kakao', meaning: 'cacao', characterIds: ['katakana-ka', 'katakana-ka', 'katakana-o'] },
    { id: 'katakana-a-gia', kana: 'ギア', romaji: 'gia', meaning: 'gear (e.g. on a bicycle)', characterIds: ['katakana-gi', 'katakana-a'] },
  ],
  'katakana-sa-row': [
    { id: 'katakana-sa-aisu', kana: 'アイス', romaji: 'aisu', meaning: 'ice cream', characterIds: ['katakana-a', 'katakana-i', 'katakana-su'] },
    { id: 'katakana-sa-zou', kana: 'ゾウ', romaji: 'zou', meaning: 'elephant', characterIds: ['katakana-zo', 'katakana-u'] },
    { id: 'katakana-sa-sai', kana: 'サイ', romaji: 'sai', meaning: 'rhinoceros', characterIds: ['katakana-sa', 'katakana-i'] },
    { id: 'katakana-sa-kuizu', kana: 'クイズ', romaji: 'kuizu', meaning: 'quiz', characterIds: ['katakana-ku', 'katakana-i', 'katakana-zu'] },
    { id: 'katakana-sa-soosu', kana: 'ソース', romaji: 'soosu', meaning: 'sauce', characterIds: ['katakana-so', 'katakana-chouon', 'katakana-su'] },
    { id: 'katakana-sa-sain', kana: 'サイン', romaji: 'sain', meaning: 'autograph / signature', characterIds: ['katakana-sa', 'katakana-i', 'katakana-n'] },
    { id: 'katakana-sa-saizu', kana: 'サイズ', romaji: 'saizu', meaning: 'size', characterIds: ['katakana-sa', 'katakana-i', 'katakana-zu'] },
    { id: 'katakana-sa-sukii', kana: 'スキー', romaji: 'sukii', meaning: 'ski / skiing', characterIds: ['katakana-su', 'katakana-ki', 'katakana-chouon'] },
    // サザエ (turban shell) and ガーゼ (gauze) were removed at the user's
    // request as unnatural (a niche seafood term and a medical-supply
    // word — neither is everyday kid vocabulary), replaced with two more
    // common food/practical words.
    { id: 'katakana-sa-sooseeji', kana: 'ソーセージ', romaji: 'sooseeji', meaning: 'sausage', characterIds: ['katakana-so', 'katakana-chouon', 'katakana-se', 'katakana-chouon', 'katakana-ji'] },
    { id: 'katakana-sa-keesu', kana: 'ケース', romaji: 'keesu', meaning: 'case', characterIds: ['katakana-ke', 'katakana-chouon', 'katakana-su'] },
  ],
  'katakana-ta-row': [
    // タコ (octopus) removed — duplicates hiragana's たこ, already taught
    // in た行 there (see this section's header comment).
    { id: 'katakana-ta-tokage', kana: 'トカゲ', romaji: 'tokage', meaning: 'lizard', characterIds: ['katakana-to', 'katakana-ka', 'katakana-ge'] },
    { id: 'katakana-ta-tesuto', kana: 'テスト', romaji: 'tesuto', meaning: 'test', characterIds: ['katakana-te', 'katakana-su', 'katakana-to'] },
    { id: 'katakana-ta-tai', kana: 'タイ', romaji: 'tai', meaning: 'Thailand', characterIds: ['katakana-ta', 'katakana-i'] },
    { id: 'katakana-ta-doitsu', kana: 'ドイツ', romaji: 'doitsu', meaning: 'Germany', characterIds: ['katakana-do', 'katakana-i', 'katakana-tsu'] },
    { id: 'katakana-ta-aidea', kana: 'アイデア', romaji: 'aidea', meaning: 'idea', characterIds: ['katakana-a', 'katakana-i', 'katakana-de', 'katakana-a'] },
    { id: 'katakana-ta-toosuto', kana: 'トースト', romaji: 'toosuto', meaning: 'toast', characterIds: ['katakana-to', 'katakana-chouon', 'katakana-su', 'katakana-to'] },
    { id: 'katakana-ta-tento', kana: 'テント', romaji: 'tento', meaning: 'tent', characterIds: ['katakana-te', 'katakana-n', 'katakana-to'] },
    { id: 'katakana-ta-santa', kana: 'サンタ', romaji: 'santa', meaning: 'Santa (Claus)', characterIds: ['katakana-sa', 'katakana-n', 'katakana-ta'] },
    { id: 'katakana-ta-chiizu', kana: 'チーズ', romaji: 'chiizu', meaning: 'cheese', characterIds: ['katakana-chi', 'katakana-chouon', 'katakana-zu'] },
  ],
  'katakana-na-row': [
    { id: 'katakana-na-kani', kana: 'カニ', romaji: 'kani', meaning: 'crab', characterIds: ['katakana-ka', 'katakana-ni'] },
    { id: 'katakana-na-tenisu', kana: 'テニス', romaji: 'tenisu', meaning: 'tennis', characterIds: ['katakana-te', 'katakana-ni', 'katakana-su'] },
    { id: 'katakana-na-nasu', kana: 'ナス', romaji: 'nasu', meaning: 'eggplant', characterIds: ['katakana-na', 'katakana-su'] },
    { id: 'katakana-na-nooto', kana: 'ノート', romaji: 'nooto', meaning: 'notebook', characterIds: ['katakana-no', 'katakana-chouon', 'katakana-to'] },
    { id: 'katakana-na-antena', kana: 'アンテナ', romaji: 'antena', meaning: 'antenna', characterIds: ['katakana-a', 'katakana-n', 'katakana-te', 'katakana-na'] },
    { id: 'katakana-na-sauna', kana: 'サウナ', romaji: 'sauna', meaning: 'sauna', characterIds: ['katakana-sa', 'katakana-u', 'katakana-na'] },
    { id: 'katakana-na-doonatsu', kana: 'ドーナツ', romaji: 'doonatsu', meaning: 'donut', characterIds: ['katakana-do', 'katakana-chouon', 'katakana-na', 'katakana-tsu'] },
    { id: 'katakana-na-kanuu', kana: 'カヌー', romaji: 'kanuu', meaning: 'canoe', characterIds: ['katakana-ka', 'katakana-nu', 'katakana-chouon'] },
  ],
  'katakana-ha-row': [
    { id: 'katakana-ha-pan', kana: 'パン', romaji: 'pan', meaning: 'bread', characterIds: ['katakana-pa', 'katakana-n'] },
    { id: 'katakana-ha-basu', kana: 'バス', romaji: 'basu', meaning: 'bus', characterIds: ['katakana-ba', 'katakana-su'] },
    { id: 'katakana-ha-kaba', kana: 'カバ', romaji: 'kaba', meaning: 'hippopotamus', characterIds: ['katakana-ka', 'katakana-ba'] },
    { id: 'katakana-ha-panda', kana: 'パンダ', romaji: 'panda', meaning: 'panda', characterIds: ['katakana-pa', 'katakana-n', 'katakana-da'] },
    { id: 'katakana-ha-piza', kana: 'ピザ', romaji: 'piza', meaning: 'pizza', characterIds: ['katakana-pi', 'katakana-za'] },
    { id: 'katakana-ha-pasuta', kana: 'パスタ', romaji: 'pasuta', meaning: 'pasta', characterIds: ['katakana-pa', 'katakana-su', 'katakana-ta'] },
    { id: 'katakana-ha-banana', kana: 'バナナ', romaji: 'banana', meaning: 'banana', characterIds: ['katakana-ba', 'katakana-na', 'katakana-na'] },
    { id: 'katakana-ha-papa', kana: 'パパ', romaji: 'papa', meaning: 'dad', characterIds: ['katakana-pa', 'katakana-pa'] },
    { id: 'katakana-ha-piano', kana: 'ピアノ', romaji: 'piano', meaning: 'piano', characterIds: ['katakana-pi', 'katakana-a', 'katakana-no'] },
    { id: 'katakana-ha-pinku', kana: 'ピンク', romaji: 'pinku', meaning: 'pink', characterIds: ['katakana-pi', 'katakana-n', 'katakana-ku'] },
  ],
  'katakana-ma-row': [
    { id: 'katakana-ma-mama', kana: 'ママ', romaji: 'mama', meaning: 'mom', characterIds: ['katakana-ma', 'katakana-ma'] },
    { id: 'katakana-ma-anime', kana: 'アニメ', romaji: 'anime', meaning: 'anime', characterIds: ['katakana-a', 'katakana-ni', 'katakana-me'] },
    { id: 'katakana-ma-tomato', kana: 'トマト', romaji: 'tomato', meaning: 'tomato', characterIds: ['katakana-to', 'katakana-ma', 'katakana-to'] },
    { id: 'katakana-ma-same', kana: 'サメ', romaji: 'same', meaning: 'shark', characterIds: ['katakana-sa', 'katakana-me'] },
    { id: 'katakana-ma-memo', kana: 'メモ', romaji: 'memo', meaning: 'memo / note', characterIds: ['katakana-me', 'katakana-mo'] },
    { id: 'katakana-ma-gomu', kana: 'ゴム', romaji: 'gomu', meaning: 'rubber / eraser', characterIds: ['katakana-go', 'katakana-mu'] },
    { id: 'katakana-ma-misu', kana: 'ミス', romaji: 'misu', meaning: 'mistake', characterIds: ['katakana-mi', 'katakana-su'] },
    { id: 'katakana-ma-geemu', kana: 'ゲーム', romaji: 'geemu', meaning: 'game', characterIds: ['katakana-ge', 'katakana-chouon', 'katakana-mu'] },
    { id: 'katakana-ma-suimingu', kana: 'スイミング', romaji: 'suimingu', meaning: 'swimming', characterIds: ['katakana-su', 'katakana-i', 'katakana-mi', 'katakana-n', 'katakana-gu'] },
    { id: 'katakana-ma-masuku', kana: 'マスク', romaji: 'masuku', meaning: 'mask', characterIds: ['katakana-ma', 'katakana-su', 'katakana-ku'] },
  ],
  'katakana-ya-row': [
    { id: 'katakana-ya-hiyoko', kana: 'ヒヨコ', romaji: 'hiyoko', meaning: 'baby chick', characterIds: ['katakana-hi', 'katakana-yo', 'katakana-ko'] },
    { id: 'katakana-ya-taiya', kana: 'タイヤ', romaji: 'taiya', meaning: 'tire', characterIds: ['katakana-ta', 'katakana-i', 'katakana-ya'] },
    { id: 'katakana-ya-yoga', kana: 'ヨガ', romaji: 'yoga', meaning: 'yoga', characterIds: ['katakana-yo', 'katakana-ga'] },
    { id: 'katakana-ya-hayabusa', kana: 'ハヤブサ', romaji: 'hayabusa', meaning: 'peregrine falcon (also a famous spacecraft)', characterIds: ['katakana-ha', 'katakana-ya', 'katakana-bu', 'katakana-sa'] },
    { id: 'katakana-ya-daiya', kana: 'ダイヤ', romaji: 'daiya', meaning: 'diamond', characterIds: ['katakana-da', 'katakana-i', 'katakana-ya'] },
    { id: 'katakana-ya-moyashi', kana: 'モヤシ', romaji: 'moyashi', meaning: 'bean sprouts', characterIds: ['katakana-mo', 'katakana-ya', 'katakana-shi'] },
    { id: 'katakana-ya-yunikoon', kana: 'ユニコーン', romaji: 'yunikoon', meaning: 'unicorn', characterIds: ['katakana-yu', 'katakana-ni', 'katakana-ko', 'katakana-chouon', 'katakana-n'] },
    { id: 'katakana-ya-yagi', kana: 'ヤギ', romaji: 'yagi', meaning: 'goat', characterIds: ['katakana-ya', 'katakana-gi'] },
  ],
  'katakana-ra-row': [
    { id: 'katakana-ra-terebi', kana: 'テレビ', romaji: 'terebi', meaning: 'TV', characterIds: ['katakana-te', 'katakana-re', 'katakana-bi'] },
    { id: 'katakana-ra-karee', kana: 'カレー', romaji: 'karee', meaning: 'curry', characterIds: ['katakana-ka', 'katakana-re', 'katakana-chouon'] },
    { id: 'katakana-ra-raion', kana: 'ライオン', romaji: 'raion', meaning: 'lion', characterIds: ['katakana-ra', 'katakana-i', 'katakana-o', 'katakana-n'] },
    { id: 'katakana-ra-wani', kana: 'ワニ', romaji: 'wani', meaning: 'crocodile / alligator', characterIds: ['katakana-wa', 'katakana-ni'] },
    { id: 'katakana-ra-koara', kana: 'コアラ', romaji: 'koara', meaning: 'koala', characterIds: ['katakana-ko', 'katakana-a', 'katakana-ra'] },
    { id: 'katakana-ra-tora', kana: 'トラ', romaji: 'tora', meaning: 'tiger', characterIds: ['katakana-to', 'katakana-ra'] },
    { id: 'katakana-ra-kamera', kana: 'カメラ', romaji: 'kamera', meaning: 'camera', characterIds: ['katakana-ka', 'katakana-me', 'katakana-ra'] },
    { id: 'katakana-ra-sarada', kana: 'サラダ', romaji: 'sarada', meaning: 'salad', characterIds: ['katakana-sa', 'katakana-ra', 'katakana-da'] },
    { id: 'katakana-ra-rajio', kana: 'ラジオ', romaji: 'rajio', meaning: 'radio', characterIds: ['katakana-ra', 'katakana-ji', 'katakana-o'] },
    { id: 'katakana-ra-booru', kana: 'ボール', romaji: 'booru', meaning: 'ball', characterIds: ['katakana-bo', 'katakana-chouon', 'katakana-ru'] },
  ],
}

export const ALL_WORDS: AnchorWord[] = Object.values(WORDS_BY_ROW).flat()

export const WORDS_BY_ID: Record<string, AnchorWord> = Object.fromEntries(
  ALL_WORDS.map((w) => [w.id, w]),
)
