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
  // katakana-a-row is unusually thin (5, vs. the ~8-10 elsewhere): almost no
  // real katakana word is spelled using only vowel morae (loanwords need
  // consonants), unlike hiragana's あ行 which has genuine native
  // vowel-only words (あい, うえ, ...). These 5 are all real, dictionary/
  // encyclopedia-attested katakana spellings, just a thinner pool than later
  // rows where consonants open up far more loanword vocabulary.
  //
  // katakana-wa-row's characters include ヲ (unlike hiragana's を, which
  // gets a demonstration phrase — みずをのむ), but no word below uses it:
  // modern Japanese never actually writes the を particle in katakana even
  // inside all-katakana text (particles stay hiragana), so there's no
  // authentic word or phrase to demonstrate here without reaching for
  // obscure pre-1946 orthography. ヲ is still taught as a character (Learn
  // flashcard, stroke order) for structural completeness with hiragana's
  // row, it just has no vocabulary reinforcement — flagged for review.
  'katakana-a-row': [
    { id: 'katakana-a-ei', kana: 'エイ', romaji: 'ei', meaning: 'stingray', characterIds: ['katakana-e', 'katakana-i'] },
    { id: 'katakana-a-aiai', kana: 'アイアイ', romaji: 'aiai', meaning: 'aye-aye (a lemur)', characterIds: ['katakana-a', 'katakana-i', 'katakana-a', 'katakana-i'] },
    { id: 'katakana-a-aoi', kana: 'アオイ', romaji: 'aoi', meaning: 'Aoi (a name)', characterIds: ['katakana-a', 'katakana-o', 'katakana-i'] },
    { id: 'katakana-a-io', kana: 'イオ', romaji: 'io', meaning: 'Io (a moon of Jupiter)', characterIds: ['katakana-i', 'katakana-o'] },
    { id: 'katakana-a-ea', kana: 'エア', romaji: 'ea', meaning: 'air (as in air conditioner)', characterIds: ['katakana-e', 'katakana-a'] },
  ],
  'katakana-ka-row': [
    { id: 'katakana-ka-ika', kana: 'イカ', romaji: 'ika', meaning: 'squid', characterIds: ['katakana-i', 'katakana-ka'] },
    { id: 'katakana-ka-kaki', kana: 'カキ', romaji: 'kaki', meaning: 'oyster', characterIds: ['katakana-ka', 'katakana-ki'] },
    { id: 'katakana-ka-kokoa', kana: 'ココア', romaji: 'kokoa', meaning: 'cocoa', characterIds: ['katakana-ko', 'katakana-ko', 'katakana-a'] },
    { id: 'katakana-ka-kakao', kana: 'カカオ', romaji: 'kakao', meaning: 'cacao', characterIds: ['katakana-ka', 'katakana-ka', 'katakana-o'] },
    { id: 'katakana-ka-gia', kana: 'ギア', romaji: 'gia', meaning: 'gear', characterIds: ['katakana-gi', 'katakana-a'] },
    { id: 'katakana-ka-eko', kana: 'エコ', romaji: 'eko', meaning: 'eco / environmentally friendly', characterIds: ['katakana-e', 'katakana-ko'] },
    { id: 'katakana-ka-goa', kana: 'ゴア', romaji: 'goa', meaning: 'Goa (a place in India)', characterIds: ['katakana-go', 'katakana-a'] },
    { id: 'katakana-ka-kai', kana: 'カイ', romaji: 'kai', meaning: 'Kai (a name)', characterIds: ['katakana-ka', 'katakana-i'] },
  ],
  'katakana-sa-row': [
    { id: 'katakana-sa-saizu', kana: 'サイズ', romaji: 'saizu', meaning: 'size', characterIds: ['katakana-sa', 'katakana-i', 'katakana-zu'] },
    { id: 'katakana-sa-gasu', kana: 'ガス', romaji: 'gasu', meaning: 'gas', characterIds: ['katakana-ga', 'katakana-su'] },
    { id: 'katakana-sa-zou', kana: 'ゾウ', romaji: 'zou', meaning: 'elephant', characterIds: ['katakana-zo', 'katakana-u'] },
    { id: 'katakana-sa-sai', kana: 'サイ', romaji: 'sai', meaning: 'rhinoceros', characterIds: ['katakana-sa', 'katakana-i'] },
    { id: 'katakana-sa-suisu', kana: 'スイス', romaji: 'suisu', meaning: 'Switzerland', characterIds: ['katakana-su', 'katakana-i', 'katakana-su'] },
    { id: 'katakana-sa-ajia', kana: 'アジア', romaji: 'ajia', meaning: 'Asia', characterIds: ['katakana-a', 'katakana-ji', 'katakana-a'] },
    { id: 'katakana-sa-kuizu', kana: 'クイズ', romaji: 'kuizu', meaning: 'quiz', characterIds: ['katakana-ku', 'katakana-i', 'katakana-zu'] },
    { id: 'katakana-sa-oashisu', kana: 'オアシス', romaji: 'oashisu', meaning: 'oasis', characterIds: ['katakana-o', 'katakana-a', 'katakana-shi', 'katakana-su'] },
  ],
  'katakana-ta-row': [
    { id: 'katakana-ta-tokage', kana: 'トカゲ', romaji: 'tokage', meaning: 'lizard', characterIds: ['katakana-to', 'katakana-ka', 'katakana-ge'] },
    { id: 'katakana-ta-tako', kana: 'タコ', romaji: 'tako', meaning: 'octopus', characterIds: ['katakana-ta', 'katakana-ko'] },
    { id: 'katakana-ta-tesuto', kana: 'テスト', romaji: 'tesuto', meaning: 'test', characterIds: ['katakana-te', 'katakana-su', 'katakana-to'] },
    { id: 'katakana-ta-tai', kana: 'タイ', romaji: 'tai', meaning: 'Thailand', characterIds: ['katakana-ta', 'katakana-i'] },
    { id: 'katakana-ta-daisu', kana: 'ダイス', romaji: 'daisu', meaning: 'dice', characterIds: ['katakana-da', 'katakana-i', 'katakana-su'] },
    { id: 'katakana-ta-jiguzagu', kana: 'ジグザグ', romaji: 'jiguzagu', meaning: 'zigzag', characterIds: ['katakana-ji', 'katakana-gu', 'katakana-za', 'katakana-gu'] },
    { id: 'katakana-ta-doitsu', kana: 'ドイツ', romaji: 'doitsu', meaning: 'Germany', characterIds: ['katakana-do', 'katakana-i', 'katakana-tsu'] },
    { id: 'katakana-ta-aidea', kana: 'アイデア', romaji: 'aidea', meaning: 'idea', characterIds: ['katakana-a', 'katakana-i', 'katakana-de', 'katakana-a'] },
  ],
  'katakana-na-row': [
    { id: 'katakana-na-kani', kana: 'カニ', romaji: 'kani', meaning: 'crab', characterIds: ['katakana-ka', 'katakana-ni'] },
    { id: 'katakana-na-tenisu', kana: 'テニス', romaji: 'tenisu', meaning: 'tennis', characterIds: ['katakana-te', 'katakana-ni', 'katakana-su'] },
    { id: 'katakana-na-nasu', kana: 'ナス', romaji: 'nasu', meaning: 'eggplant', characterIds: ['katakana-na', 'katakana-su'] },
    { id: 'katakana-na-sauna', kana: 'サウナ', romaji: 'sauna', meaning: 'sauna', characterIds: ['katakana-sa', 'katakana-u', 'katakana-na'] },
    { id: 'katakana-na-noizu', kana: 'ノイズ', romaji: 'noizu', meaning: 'noise', characterIds: ['katakana-no', 'katakana-i', 'katakana-zu'] },
    { id: 'katakana-na-nana', kana: 'ナナ', romaji: 'nana', meaning: 'Nana (a name)', characterIds: ['katakana-na', 'katakana-na'] },
  ],
  'katakana-ha-row': [
    { id: 'katakana-ha-pai', kana: 'パイ', romaji: 'pai', meaning: 'pie', characterIds: ['katakana-pa', 'katakana-i'] },
    { id: 'katakana-ha-basu', kana: 'バス', romaji: 'basu', meaning: 'bus', characterIds: ['katakana-ba', 'katakana-su'] },
    { id: 'katakana-ha-kaba', kana: 'カバ', romaji: 'kaba', meaning: 'hippopotamus', characterIds: ['katakana-ka', 'katakana-ba'] },
    { id: 'katakana-ha-papa', kana: 'パパ', romaji: 'papa', meaning: 'dad', characterIds: ['katakana-pa', 'katakana-pa'] },
    { id: 'katakana-ha-banana', kana: 'バナナ', romaji: 'banana', meaning: 'banana', characterIds: ['katakana-ba', 'katakana-na', 'katakana-na'] },
    { id: 'katakana-ha-piza', kana: 'ピザ', romaji: 'piza', meaning: 'pizza', characterIds: ['katakana-pi', 'katakana-za'] },
    { id: 'katakana-ha-pasuta', kana: 'パスタ', romaji: 'pasuta', meaning: 'pasta', characterIds: ['katakana-pa', 'katakana-su', 'katakana-ta'] },
    { id: 'katakana-ha-habu', kana: 'ハブ', romaji: 'habu', meaning: 'habu (a venomous snake)', characterIds: ['katakana-ha', 'katakana-bu'] },
  ],
  'katakana-ma-row': [
    { id: 'katakana-ma-mama', kana: 'ママ', romaji: 'mama', meaning: 'mom', characterIds: ['katakana-ma', 'katakana-ma'] },
    { id: 'katakana-ma-anime', kana: 'アニメ', romaji: 'anime', meaning: 'anime', characterIds: ['katakana-a', 'katakana-ni', 'katakana-me'] },
    { id: 'katakana-ma-tomato', kana: 'トマト', romaji: 'tomato', meaning: 'tomato', characterIds: ['katakana-to', 'katakana-ma', 'katakana-to'] },
    { id: 'katakana-ma-same', kana: 'サメ', romaji: 'same', meaning: 'shark', characterIds: ['katakana-sa', 'katakana-me'] },
    { id: 'katakana-ma-memo', kana: 'メモ', romaji: 'memo', meaning: 'memo / note', characterIds: ['katakana-me', 'katakana-mo'] },
    { id: 'katakana-ma-gomu', kana: 'ゴム', romaji: 'gomu', meaning: 'rubber / eraser', characterIds: ['katakana-go', 'katakana-mu'] },
    { id: 'katakana-ma-misu', kana: 'ミス', romaji: 'misu', meaning: 'mistake', characterIds: ['katakana-mi', 'katakana-su'] },
    { id: 'katakana-ma-momo', kana: 'モモ', romaji: 'momo', meaning: 'Momo (a common pet name)', characterIds: ['katakana-mo', 'katakana-mo'] },
  ],
  'katakana-ya-row': [
    { id: 'katakana-ya-hiyoko', kana: 'ヒヨコ', romaji: 'hiyoko', meaning: 'baby chick', characterIds: ['katakana-hi', 'katakana-yo', 'katakana-ko'] },
    { id: 'katakana-ya-taiya', kana: 'タイヤ', romaji: 'taiya', meaning: 'tire', characterIds: ['katakana-ta', 'katakana-i', 'katakana-ya'] },
    { id: 'katakana-ya-yoga', kana: 'ヨガ', romaji: 'yoga', meaning: 'yoga', characterIds: ['katakana-yo', 'katakana-ga'] },
    { id: 'katakana-ya-hayabusa', kana: 'ハヤブサ', romaji: 'hayabusa', meaning: 'peregrine falcon', characterIds: ['katakana-ha', 'katakana-ya', 'katakana-bu', 'katakana-sa'] },
    { id: 'katakana-ya-yuki', kana: 'ユキ', romaji: 'yuki', meaning: 'Yuki (a name)', characterIds: ['katakana-yu', 'katakana-ki'] },
    { id: 'katakana-ya-moyashi', kana: 'モヤシ', romaji: 'moyashi', meaning: 'bean sprouts', characterIds: ['katakana-mo', 'katakana-ya', 'katakana-shi'] },
    { id: 'katakana-ya-daiya', kana: 'ダイヤ', romaji: 'daiya', meaning: 'diamond', characterIds: ['katakana-da', 'katakana-i', 'katakana-ya'] },
  ],
  'katakana-ra-row': [
    { id: 'katakana-ra-koara', kana: 'コアラ', romaji: 'koara', meaning: 'koala', characterIds: ['katakana-ko', 'katakana-a', 'katakana-ra'] },
    { id: 'katakana-ra-tora', kana: 'トラ', romaji: 'tora', meaning: 'tiger', characterIds: ['katakana-to', 'katakana-ra'] },
    { id: 'katakana-ra-kamera', kana: 'カメラ', romaji: 'kamera', meaning: 'camera', characterIds: ['katakana-ka', 'katakana-me', 'katakana-ra'] },
    { id: 'katakana-ra-dorama', kana: 'ドラマ', romaji: 'dorama', meaning: 'drama (TV show)', characterIds: ['katakana-do', 'katakana-ra', 'katakana-ma'] },
    { id: 'katakana-ra-sarada', kana: 'サラダ', romaji: 'sarada', meaning: 'salad', characterIds: ['katakana-sa', 'katakana-ra', 'katakana-da'] },
    { id: 'katakana-ra-rajio', kana: 'ラジオ', romaji: 'rajio', meaning: 'radio', characterIds: ['katakana-ra', 'katakana-ji', 'katakana-o'] },
    { id: 'katakana-ra-kurasu', kana: 'クラス', romaji: 'kurasu', meaning: 'class', characterIds: ['katakana-ku', 'katakana-ra', 'katakana-su'] },
    { id: 'katakana-ra-roba', kana: 'ロバ', romaji: 'roba', meaning: 'donkey', characterIds: ['katakana-ro', 'katakana-ba'] },
    { id: 'katakana-ra-doriru', kana: 'ドリル', romaji: 'doriru', meaning: 'practice drill', characterIds: ['katakana-do', 'katakana-ri', 'katakana-ru'] },
  ],
  'katakana-wa-row': [
    { id: 'katakana-wa-pan', kana: 'パン', romaji: 'pan', meaning: 'bread', characterIds: ['katakana-pa', 'katakana-n'] },
    { id: 'katakana-wa-kirin', kana: 'キリン', romaji: 'kirin', meaning: 'giraffe', characterIds: ['katakana-ki', 'katakana-ri', 'katakana-n'] },
    { id: 'katakana-wa-remon', kana: 'レモン', romaji: 'remon', meaning: 'lemon', characterIds: ['katakana-re', 'katakana-mo', 'katakana-n'] },
    { id: 'katakana-wa-wain', kana: 'ワイン', romaji: 'wain', meaning: 'wine', characterIds: ['katakana-wa', 'katakana-i', 'katakana-n'] },
    { id: 'katakana-wa-pen', kana: 'ペン', romaji: 'pen', meaning: 'pen', characterIds: ['katakana-pe', 'katakana-n'] },
    { id: 'katakana-wa-wani', kana: 'ワニ', romaji: 'wani', meaning: 'crocodile', characterIds: ['katakana-wa', 'katakana-ni'] },
    { id: 'katakana-wa-sandaru', kana: 'サンダル', romaji: 'sandaru', meaning: 'sandal', characterIds: ['katakana-sa', 'katakana-n', 'katakana-da', 'katakana-ru'] },
    { id: 'katakana-wa-terebi', kana: 'テレビ', romaji: 'terebi', meaning: 'TV', characterIds: ['katakana-te', 'katakana-re', 'katakana-bi'] },
  ],
  // Every word here uses ー at least once — see the "ー's own row" note in
  // characters.ts/curriculum.ts. Romaji spells it with the standard
  // doubled-vowel ASCII convention (keeki, koohii, ...) rather than a
  // macron, matching katakana-chouon's single-character romaji ('-') so
  // isAnswerCorrect's per-character length bookkeeping (see
  // lib/answerChecking.ts's romajiVariants) lines up: doubling a vowel and
  // a 1-char placeholder both add exactly one letter per ー.
  'katakana-chouon-row': [
    { id: 'katakana-chouon-keeki', kana: 'ケーキ', romaji: 'keeki', meaning: 'cake', characterIds: ['katakana-ke', 'katakana-chouon', 'katakana-ki'] },
    { id: 'katakana-chouon-koohii', kana: 'コーヒー', romaji: 'koohii', meaning: 'coffee', characterIds: ['katakana-ko', 'katakana-chouon', 'katakana-hi', 'katakana-chouon'] },
    { id: 'katakana-chouon-nooto', kana: 'ノート', romaji: 'nooto', meaning: 'notebook', characterIds: ['katakana-no', 'katakana-chouon', 'katakana-to'] },
    { id: 'katakana-chouon-kaado', kana: 'カード', romaji: 'kaado', meaning: 'card', characterIds: ['katakana-ka', 'katakana-chouon', 'katakana-do'] },
    { id: 'katakana-chouon-booru', kana: 'ボール', romaji: 'booru', meaning: 'ball', characterIds: ['katakana-bo', 'katakana-chouon', 'katakana-ru'] },
    { id: 'katakana-chouon-gitaa', kana: 'ギター', romaji: 'gitaa', meaning: 'guitar', characterIds: ['katakana-gi', 'katakana-ta', 'katakana-chouon'] },
    { id: 'katakana-chouon-chiizu', kana: 'チーズ', romaji: 'chiizu', meaning: 'cheese', characterIds: ['katakana-chi', 'katakana-chouon', 'katakana-zu'] },
    { id: 'katakana-chouon-sukaato', kana: 'スカート', romaji: 'sukaato', meaning: 'skirt', characterIds: ['katakana-su', 'katakana-ka', 'katakana-chouon', 'katakana-to'] },
  ],

  // ===== 促音 (sokuon) vocabulary =====
  // One combined row spanning both scripts (see curriculum.ts's
  // sokuon-row) — hiragana and katakana words interleaved by contrast
  // pair/family rather than grouped by script, since the whole point of
  // this lesson is hearing っ/ッ do the same thing across both. Every word
  // here draws on the full hiragana + katakana character pool (both fully
  // taught by this point in the curriculum — see getCumulativeCharacterIds'
  // cross-category handling in curriculum.ts), not just sokuon's own っ/ッ.
  // `image` is intentionally omitted throughout, same as katakana's
  // vocabulary — no illustration set exists for this content yet.
  'sokuon-row': [
    // The classic minimal pair: identical except for gemination.
    { id: 'sokuon-oto', kana: 'おと', romaji: 'oto', meaning: 'sound', characterIds: ['o', 'to'], audioText: '音' },
    { id: 'sokuon-otto', kana: 'おっと', romaji: 'otto', meaning: 'husband', characterIds: ['o', 'sokuon', 'to'], audioText: '夫' },
    { id: 'sokuon-gakkou', kana: 'がっこう', romaji: 'gakkou', meaning: 'school', characterIds: ['ga', 'sokuon', 'ko', 'u'], audioText: '学校' },
    { id: 'sokuon-kippu', kana: 'きっぷ', romaji: 'kippu', meaning: 'ticket', characterIds: ['ki', 'sokuon', 'pu'], audioText: '切符' },
    // こっち has no kanji spelling in ordinary use (always written in kana,
    // like ここ elsewhere in this file) — no audioText override.
    { id: 'sokuon-kotchi', kana: 'こっち', romaji: 'kotchi', meaning: 'here / this way', characterIds: ['ko', 'sokuon', 'chi'] },
    { id: 'sokuon-katakana-beddo', kana: 'ベッド', romaji: 'beddo', meaning: 'bed', characterIds: ['katakana-be', 'katakana-sokuon', 'katakana-do'] },
    { id: 'sokuon-katakana-sakkaa', kana: 'サッカー', romaji: 'sakkaa', meaning: 'soccer', characterIds: ['katakana-sa', 'katakana-sokuon', 'katakana-ka', 'katakana-chouon'] },
    { id: 'sokuon-katakana-kukkii', kana: 'クッキー', romaji: 'kukkii', meaning: 'cookie', characterIds: ['katakana-ku', 'katakana-sokuon', 'katakana-ki', 'katakana-chouon'] },
    { id: 'sokuon-katakana-kappu', kana: 'カップ', romaji: 'kappu', meaning: 'cup', characterIds: ['katakana-ka', 'katakana-sokuon', 'katakana-pu'] },
    { id: 'sokuon-katakana-roketto', kana: 'ロケット', romaji: 'roketto', meaning: 'rocket', characterIds: ['katakana-ro', 'katakana-ke', 'katakana-sokuon', 'katakana-to'] },
  ],

  // ===== 長音 (chōon) vocabulary =====
  // One combined row spanning both scripts (see curriculum.ts's
  // chouon-row), same shape as sokuon-row above. Unlike sokuon, this row's
  // OWN characterIds is [] — every word below is spelled entirely from
  // hiragana/katakana characters already taught, since chōon itself isn't
  // a discrete glyph in hiragana (it's a spelling pattern: repeat/extend
  // the preceding vowel) and katakana's ー was already introduced under
  // カタカナ単音 (this lesson only reviews it). The pairs are grouped to
  // read as minimal-pair families, covering hiragana's different
  // long-vowel spelling patterns rather than just the あ-row case:
  //   おばさん/おばあさん, おじさん/おじいさん — あ-row and い-row
  //   すうじ — う-row; せんせい — え-row (spelled with い);
  //   おとうさん — お-row (spelled with う)
  // plus katakana's ー reviewed via ビル/ビール and カレー.
  // `image` is intentionally omitted throughout, same as sokuon's/
  // katakana's vocabulary — no illustration set exists for this content yet.
  'chouon-row': [
    { id: 'chouon-okaasan', kana: 'おかあさん', romaji: 'okaasan', meaning: 'mother', characterIds: ['o', 'ka', 'a', 'sa', 'n'], audioText: 'お母さん' },
    // Minimal pair #1: あ-row lengthening distinguishes "aunt" from
    // "grandmother" — the user's own example for this lesson.
    { id: 'chouon-obasan', kana: 'おばさん', romaji: 'obasan', meaning: 'aunt', characterIds: ['o', 'ba', 'sa', 'n'], audioText: '叔母さん' },
    { id: 'chouon-obaasan', kana: 'おばあさん', romaji: 'obaasan', meaning: 'grandmother', characterIds: ['o', 'ba', 'a', 'sa', 'n'], audioText: 'お祖母さん' },
    // Minimal pair #2: same rule, い-row this time — "uncle" vs. "grandfather".
    { id: 'chouon-ojisan', kana: 'おじさん', romaji: 'ojisan', meaning: 'uncle', characterIds: ['o', 'ji', 'sa', 'n'], audioText: '叔父さん' },
    { id: 'chouon-ojiisan', kana: 'おじいさん', romaji: 'ojiisan', meaning: 'grandfather', characterIds: ['o', 'ji', 'i', 'sa', 'n'], audioText: 'お祖父さん' },
    // う-row lengthening (no contrast partner needed — the pattern itself
    // is the point: すじ isn't a competing real word here).
    { id: 'chouon-suuji', kana: 'すうじ', romaji: 'suuji', meaning: 'number / digit', characterIds: ['su', 'u', 'ji'], audioText: '数字' },
    // え-row lengthening, spelled with い rather than え — the trickiest
    // hiragana pattern for a learner to predict.
    { id: 'chouon-sensei', kana: 'せんせい', romaji: 'sensei', meaning: 'teacher', characterIds: ['se', 'n', 'se', 'i'], audioText: '先生' },
    // お-row lengthening, spelled with う rather than お — the other
    // commonly-missed pattern, and a natural pair with おかあさん above.
    { id: 'chouon-otousan', kana: 'おとうさん', romaji: 'otousan', meaning: 'father', characterIds: ['o', 'to', 'u', 'sa', 'n'], audioText: 'お父さん' },
    // Katakana review: ー lengthens the preceding vowel exactly like a
    // held mora, spelled with a plain dash-like mark instead of a repeated
    // kana — ビル/ビール is the user's own minimal pair for this.
    { id: 'chouon-katakana-biru', kana: 'ビル', romaji: 'biru', meaning: 'building', characterIds: ['katakana-bi', 'katakana-ru'] },
    { id: 'chouon-katakana-biiru', kana: 'ビール', romaji: 'biiru', meaning: 'beer', characterIds: ['katakana-bi', 'katakana-chouon', 'katakana-ru'] },
    { id: 'chouon-katakana-karee', kana: 'カレー', romaji: 'karee', meaning: 'curry', characterIds: ['katakana-ka', 'katakana-re', 'katakana-chouon'] },
  ],

  // ===== 拗音 (yōon) vocabulary =====
  // Back to the 'character-set' shape: one row per row above, real
  // everyday vocabulary using that row's new characters. `dependsOnCategoryIds`
  // (curriculum.ts) means every word can also freely draw on the full
  // hiragana + katakana base pool regardless of row order, so words below
  // mix new yōon characters with already-taught plain kana just like any
  // hiragana/katakana row does. `image` is omitted throughout — no
  // illustration set exists for this content yet, same as katakana/sokuon/
  // chōon. A few characters below have no dedicated example word of their
  // own (flagged inline) — real Japanese vocabulary using them is genuinely
  // rare/nonexistent outside loanwords already covered elsewhere, the same
  // kind of documented gap as katakana-wa-row's ヲ.
  'youon-ka-row': [
    { id: 'youon-ka-kyaku', kana: 'きゃく', romaji: 'kyaku', meaning: 'customer / guest', characterIds: ['kya', 'ku'], audioText: '客' },
    { id: 'youon-ka-kyou', kana: 'きょう', romaji: 'kyou', meaning: 'today', characterIds: ['kyo', 'u'], audioText: '今日' },
    { id: 'youon-ka-kyoushitsu', kana: 'きょうしつ', romaji: 'kyoushitsu', meaning: 'classroom', characterIds: ['kyo', 'u', 'shi', 'tsu'], audioText: '教室' },
    { id: 'youon-ka-gyouza', kana: 'ぎょうざ', romaji: 'gyouza', meaning: 'dumpling', characterIds: ['gyo', 'u', 'za'], audioText: '餃子' },
    { id: 'youon-ka-gyaku', kana: 'ぎゃく', romaji: 'gyaku', meaning: 'opposite / reverse', characterIds: ['gya', 'ku'], audioText: '逆' },
    { id: 'youon-ka-kingyo', kana: 'きんぎょ', romaji: 'kingyo', meaning: 'goldfish', characterIds: ['ki', 'n', 'gyo'], audioText: '金魚' },
    { id: 'youon-ka-kyuuri', kana: 'きゅうり', romaji: 'kyuuri', meaning: 'cucumber', characterIds: ['kyu', 'u', 'ri'] },
    { id: 'youon-ka-gyuuniku', kana: 'ぎゅうにく', romaji: 'gyuuniku', meaning: 'beef', characterIds: ['gyu', 'u', 'ni', 'ku'], audioText: '牛肉' },
  ],
  'youon-sha-row': [
    { id: 'youon-sha-shashin', kana: 'しゃしん', romaji: 'shashin', meaning: 'photo', characterIds: ['sha', 'shi', 'n'], audioText: '写真' },
    { id: 'youon-sha-densha', kana: 'でんしゃ', romaji: 'densha', meaning: 'train', characterIds: ['de', 'n', 'sha'], audioText: '電車' },
    { id: 'youon-sha-kaisha', kana: 'かいしゃ', romaji: 'kaisha', meaning: 'company', characterIds: ['ka', 'i', 'sha'], audioText: '会社' },
    { id: 'youon-sha-jisho', kana: 'じしょ', romaji: 'jisho', meaning: 'dictionary', characterIds: ['ji', 'sho'], audioText: '辞書' },
    { id: 'youon-sha-shukudai', kana: 'しゅくだい', romaji: 'shukudai', meaning: 'homework', characterIds: ['shu', 'ku', 'da', 'i'], audioText: '宿題' },
    { id: 'youon-sha-jagaimo', kana: 'じゃがいも', romaji: 'jagaimo', meaning: 'potato', characterIds: ['ja', 'ga', 'i', 'mo'], audioText: 'じゃが芋' },
    { id: 'youon-sha-juu', kana: 'じゅう', romaji: 'juu', meaning: 'ten', characterIds: ['ju', 'u'], audioText: '十' },
    { id: 'youon-sha-jouzu', kana: 'じょうず', romaji: 'jouzu', meaning: 'skillful', characterIds: ['jo', 'u', 'zu'], audioText: '上手' },
  ],
  'youon-cha-row': [
    { id: 'youon-cha-ocha', kana: 'おちゃ', romaji: 'ocha', meaning: 'tea', characterIds: ['o', 'cha'], audioText: 'お茶' },
    { id: 'youon-cha-chawan', kana: 'ちゃわん', romaji: 'chawan', meaning: 'rice bowl', characterIds: ['cha', 'wa', 'n'], audioText: '茶碗' },
    { id: 'youon-cha-chou', kana: 'ちょう', romaji: 'chou', meaning: 'butterfly', characterIds: ['cho', 'u'], audioText: '蝶' },
    { id: 'youon-cha-chuui', kana: 'ちゅうい', romaji: 'chuui', meaning: 'caution / attention', characterIds: ['chu', 'u', 'i'], audioText: '注意' },
    { id: 'youon-cha-omocha', kana: 'おもちゃ', romaji: 'omocha', meaning: 'toy', characterIds: ['o', 'mo', 'cha'] },
    { id: 'youon-cha-chokin', kana: 'ちょきん', romaji: 'chokin', meaning: 'savings', characterIds: ['cho', 'ki', 'n'], audioText: '貯金' },
  ],
  // にゃ/にゅ are covered below; にょ only appears in にょきにょき (a
  // mimetic word) — real everyday にょ vocabulary is otherwise about as
  // scarce as this row's character count would suggest.
  'youon-na-row': [
    { id: 'youon-na-konnyaku', kana: 'こんにゃく', romaji: 'konnyaku', meaning: 'konjac (a food)', characterIds: ['ko', 'n', 'nya', 'ku'] },
    { id: 'youon-na-nyanko', kana: 'にゃんこ', romaji: 'nyanko', meaning: 'kitty (informal for cat)', characterIds: ['nya', 'n', 'ko'] },
    { id: 'youon-na-nyuuin', kana: 'にゅういん', romaji: 'nyuuin', meaning: 'hospitalization', characterIds: ['nyu', 'u', 'i', 'n'], audioText: '入院' },
    { id: 'youon-na-gyuunyuu', kana: 'ぎゅうにゅう', romaji: 'gyuunyuu', meaning: 'milk', characterIds: ['gyu', 'u', 'nyu', 'u'], audioText: '牛乳' },
    { id: 'youon-na-nyuugaku', kana: 'にゅうがく', romaji: 'nyuugaku', meaning: 'school enrollment', characterIds: ['nyu', 'u', 'ga', 'ku'], audioText: '入学' },
    { id: 'youon-na-nyokinyoki', kana: 'にょきにょき', romaji: 'nyokinyoki', meaning: 'sprouting up one after another (onomatopoeia)', characterIds: ['nyo', 'ki', 'nyo', 'ki'] },
  ],
  // hya/byu/pyu have no dedicated word below — real vocabulary/loanwords
  // using them specifically is scarce; every other character in this row
  // gets real coverage.
  'youon-ha-row': [
    { id: 'youon-ha-hyaku', kana: 'ひゃく', romaji: 'hyaku', meaning: 'hundred', characterIds: ['hya', 'ku'], audioText: '百' },
    { id: 'youon-ha-hyakuen', kana: 'ひゃくえん', romaji: 'hyakuen', meaning: '100 yen', characterIds: ['hya', 'ku', 'e', 'n'], audioText: '百円' },
    { id: 'youon-ha-byouin', kana: 'びょういん', romaji: 'byouin', meaning: 'hospital', characterIds: ['byo', 'u', 'i', 'n'], audioText: '病院' },
    { id: 'youon-ha-byouki', kana: 'びょうき', romaji: 'byouki', meaning: 'sickness', characterIds: ['byo', 'u', 'ki'], audioText: '病気' },
    { id: 'youon-ha-sanbyaku', kana: 'さんびゃく', romaji: 'sanbyaku', meaning: 'three hundred', characterIds: ['sa', 'n', 'bya', 'ku'], audioText: '三百' },
    { id: 'youon-ha-hyou', kana: 'ひょう', romaji: 'hyou', meaning: 'leopard', characterIds: ['hyo', 'u'], audioText: '豹' },
    { id: 'youon-ha-pyonpyon', kana: 'ぴょんぴょん', romaji: 'pyonpyon', meaning: 'hop, hop (onomatopoeia)', characterIds: ['pyo', 'n', 'pyo', 'n'] },
  ],
  // みゅ has no dedicated word below — genuinely rare/absent from native
  // Japanese vocabulary outside loanwords (which spell it in katakana, see
  // youon-katakana-ma-row).
  'youon-ma-row': [
    { id: 'youon-ma-myouji', kana: 'みょうじ', romaji: 'myouji', meaning: 'surname / family name', characterIds: ['myo', 'u', 'ji'], audioText: '名字' },
    { id: 'youon-ma-myaku', kana: 'みゃく', romaji: 'myaku', meaning: 'pulse', characterIds: ['mya', 'ku'], audioText: '脈' },
    { id: 'youon-ma-bimyou', kana: 'びみょう', romaji: 'bimyou', meaning: 'subtle / delicate', characterIds: ['bi', 'myo', 'u'], audioText: '微妙' },
    { id: 'youon-ma-kimyou', kana: 'きみょう', romaji: 'kimyou', meaning: 'strange / odd', characterIds: ['ki', 'myo', 'u'], audioText: '奇妙' },
  ],
  // りゃ has no dedicated word below for the same reason — rare/absent from
  // native vocabulary (its katakana counterpart is real: リャマ "llama").
  'youon-ra-row': [
    { id: 'youon-ra-ryokou', kana: 'りょこう', romaji: 'ryokou', meaning: 'travel / trip', characterIds: ['ryo', 'ko', 'u'], audioText: '旅行' },
    { id: 'youon-ra-ryouri', kana: 'りょうり', romaji: 'ryouri', meaning: 'cooking / cuisine', characterIds: ['ryo', 'u', 'ri'], audioText: '料理' },
    { id: 'youon-ra-ryuu', kana: 'りゅう', romaji: 'ryuu', meaning: 'dragon', characterIds: ['ryu', 'u'], audioText: '竜' },
    { id: 'youon-ra-ryokan', kana: 'りょかん', romaji: 'ryokan', meaning: 'traditional Japanese inn', characterIds: ['ryo', 'ka', 'n'], audioText: '旅館' },
  ],

  // ===== 拗音 (yōon) vocabulary — カタカナ =====
  // Real loanwords, same "no image yet" convention as katakana's own
  // vocabulary above. ー is freely usable here (it's a カタカナ category
  // character — see curriculum.ts's YOUON_CATEGORY_ID comment for why that's
  // in scope even though sokuon's っ/ッ deliberately isn't).
  'youon-katakana-ka-row': [
    { id: 'youon-katakana-ka-kyabetsu', kana: 'キャベツ', romaji: 'kyabetsu', meaning: 'cabbage', characterIds: ['katakana-kya', 'katakana-be', 'katakana-tsu'] },
    { id: 'youon-katakana-ka-kyanpu', kana: 'キャンプ', romaji: 'kyanpu', meaning: 'camp', characterIds: ['katakana-kya', 'katakana-n', 'katakana-pu'] },
    { id: 'youon-katakana-ka-gyagu', kana: 'ギャグ', romaji: 'gyagu', meaning: 'gag / joke', characterIds: ['katakana-gya', 'katakana-gu'] },
    { id: 'youon-katakana-ka-gyouza', kana: 'ギョーザ', romaji: 'gyouza', meaning: 'dumpling (katakana spelling)', characterIds: ['katakana-gyo', 'katakana-chouon', 'katakana-za'] },
    { id: 'youon-katakana-ka-kyuuri', kana: 'キュウリ', romaji: 'kyuuri', meaning: 'cucumber (katakana spelling)', characterIds: ['katakana-kyu', 'katakana-u', 'katakana-ri'] },
    { id: 'youon-katakana-ka-regyuraa', kana: 'レギュラー', romaji: 'regyuraa', meaning: 'regular', characterIds: ['katakana-re', 'katakana-gyu', 'katakana-ra', 'katakana-chouon'] },
  ],
  'youon-katakana-sha-row': [
    { id: 'youon-katakana-sha-shatsu', kana: 'シャツ', romaji: 'shatsu', meaning: 'shirt', characterIds: ['katakana-sha', 'katakana-tsu'] },
    { id: 'youon-katakana-sha-shawaa', kana: 'シャワー', romaji: 'shawaa', meaning: 'shower', characterIds: ['katakana-sha', 'katakana-wa', 'katakana-chouon'] },
    { id: 'youon-katakana-sha-shuuto', kana: 'シュート', romaji: 'shuuto', meaning: 'shoot (sports)', characterIds: ['katakana-shu', 'katakana-chouon', 'katakana-to'] },
    { id: 'youon-katakana-sha-shooto', kana: 'ショート', romaji: 'shooto', meaning: 'short', characterIds: ['katakana-sho', 'katakana-chouon', 'katakana-to'] },
    { id: 'youon-katakana-sha-jamu', kana: 'ジャム', romaji: 'jamu', meaning: 'jam', characterIds: ['katakana-ja', 'katakana-mu'] },
    { id: 'youon-katakana-sha-juusu', kana: 'ジュース', romaji: 'juusu', meaning: 'juice', characterIds: ['katakana-ju', 'katakana-chouon', 'katakana-su'] },
    { id: 'youon-katakana-sha-jogingu', kana: 'ジョギング', romaji: 'jogingu', meaning: 'jogging', characterIds: ['katakana-jo', 'katakana-gi', 'katakana-n', 'katakana-gu'] },
  ],
  'youon-katakana-cha-row': [
    { id: 'youon-katakana-cha-chansu', kana: 'チャンス', romaji: 'chansu', meaning: 'chance', characterIds: ['katakana-cha', 'katakana-n', 'katakana-su'] },
    { id: 'youon-katakana-cha-chaimu', kana: 'チャイム', romaji: 'chaimu', meaning: 'chime', characterIds: ['katakana-cha', 'katakana-i', 'katakana-mu'] },
    { id: 'youon-katakana-cha-chuubu', kana: 'チューブ', romaji: 'chuubu', meaning: 'tube', characterIds: ['katakana-chu', 'katakana-chouon', 'katakana-bu'] },
    { id: 'youon-katakana-cha-chooku', kana: 'チョーク', romaji: 'chooku', meaning: 'chalk', characterIds: ['katakana-cho', 'katakana-chouon', 'katakana-ku'] },
    { id: 'youon-katakana-cha-chokoreeto', kana: 'チョコレート', romaji: 'chokoreeto', meaning: 'chocolate', characterIds: ['katakana-cho', 'katakana-ko', 'katakana-re', 'katakana-chouon', 'katakana-to'] },
  ],
  // ニョ has no dedicated word below — rare even among katakana loanwords.
  'youon-katakana-na-row': [
    { id: 'youon-katakana-na-nyaa', kana: 'ニャー', romaji: 'nyaa', meaning: 'meow', characterIds: ['katakana-nya', 'katakana-chouon'] },
    { id: 'youon-katakana-na-nyuusu', kana: 'ニュース', romaji: 'nyuusu', meaning: 'news', characterIds: ['katakana-nyu', 'katakana-chouon', 'katakana-su'] },
    { id: 'youon-katakana-na-manyuaru', kana: 'マニュアル', romaji: 'manyuaru', meaning: 'manual', characterIds: ['katakana-ma', 'katakana-nyu', 'katakana-a', 'katakana-ru'] },
    { id: 'youon-katakana-na-nyuuyooku', kana: 'ニューヨーク', romaji: 'nyuuyooku', meaning: 'New York', characterIds: ['katakana-nyu', 'katakana-chouon', 'katakana-yo', 'katakana-chouon', 'katakana-ku'] },
  ],
  // ヒャ/ビャ have no dedicated word below — rare even among katakana
  // loanwords (their sense mostly belongs to native vocabulary already
  // covered by youon-ha-row's ひゃく/さんびゃく).
  'youon-katakana-ha-row': [
    { id: 'youon-katakana-ha-hyou', kana: 'ヒョウ', romaji: 'hyou', meaning: 'leopard (katakana spelling)', characterIds: ['katakana-hyo', 'katakana-u'] },
    { id: 'youon-katakana-ha-hyuuzu', kana: 'ヒューズ', romaji: 'hyuuzu', meaning: 'fuse (electrical)', characterIds: ['katakana-hyu', 'katakana-chouon', 'katakana-zu'] },
    { id: 'youon-katakana-ha-debyuu', kana: 'デビュー', romaji: 'debyuu', meaning: 'debut', characterIds: ['katakana-de', 'katakana-byu', 'katakana-chouon'] },
    { id: 'youon-katakana-ha-pyua', kana: 'ピュア', romaji: 'pyua', meaning: 'pure', characterIds: ['katakana-pyu', 'katakana-a'] },
    { id: 'youon-katakana-ha-pyokopyoko', kana: 'ピョコピョコ', romaji: 'pyokopyoko', meaning: 'hop, hop (onomatopoeia)', characterIds: ['katakana-pyo', 'katakana-ko', 'katakana-pyo', 'katakana-ko'] },
  ],
  // ミョ has no dedicated word below — rare even among katakana loanwords.
  'youon-katakana-ma-row': [
    { id: 'youon-katakana-ma-myanmaa', kana: 'ミャンマー', romaji: 'myanmaa', meaning: 'Myanmar', characterIds: ['katakana-mya', 'katakana-n', 'katakana-ma', 'katakana-chouon'] },
    { id: 'youon-katakana-ma-myuujiamu', kana: 'ミュージアム', romaji: 'myuujiamu', meaning: 'museum', characterIds: ['katakana-myu', 'katakana-chouon', 'katakana-ji', 'katakana-a', 'katakana-mu'] },
    { id: 'youon-katakana-ma-myuuto', kana: 'ミュート', romaji: 'myuuto', meaning: 'mute', characterIds: ['katakana-myu', 'katakana-chouon', 'katakana-to'] },
    { id: 'youon-katakana-ma-myuujishan', kana: 'ミュージシャン', romaji: 'myuujishan', meaning: 'musician', characterIds: ['katakana-myu', 'katakana-chouon', 'katakana-ji', 'katakana-sha', 'katakana-n'] },
  ],
  // りゃ's own row (youon-ra-row) has no native-vocabulary example — リャマ
  // here is the real word that pattern is missing.
  'youon-katakana-ra-row': [
    { id: 'youon-katakana-ra-ryama', kana: 'リャマ', romaji: 'ryama', meaning: 'llama', characterIds: ['katakana-rya', 'katakana-ma'] },
    { id: 'youon-katakana-ra-ryuu', kana: 'リュウ', romaji: 'ryuu', meaning: 'Ryu (a name) / dragon', characterIds: ['katakana-ryu', 'katakana-u'] },
    { id: 'youon-katakana-ra-boryuumu', kana: 'ボリューム', romaji: 'boryuumu', meaning: 'volume', characterIds: ['katakana-bo', 'katakana-ryu', 'katakana-chouon', 'katakana-mu'] },
    { id: 'youon-katakana-ra-ryou', kana: 'リョウ', romaji: 'ryou', meaning: 'Ryo (a name)', characterIds: ['katakana-ryo', 'katakana-u'] },
  ],
}

export const ALL_WORDS: AnchorWord[] = Object.values(WORDS_BY_ROW).flat()

export const WORDS_BY_ID: Record<string, AnchorWord> = Object.fromEntries(
  ALL_WORDS.map((w) => [w.id, w]),
)
