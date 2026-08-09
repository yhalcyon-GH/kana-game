import type { AnchorWord } from './types'

// Word lists, one array per row. Every word here uses ONLY characters
// introduced at or before that row (validated by scripts/validateCurriculum.ts)
// so the vocabulary and kana knowledge grow together. Each row's full list
// is shown together in the row's "Step B: words" screen, and doubles as the
// word pool the practice mini-games draw from — there's no separate
// teach-only vs practice-only split, since Step B already shows every word
// for the row at once (unlike a per-character drip-feed).
//
// Special case: を is a grammatical particle that essentially never appears
// inside a standalone Japanese word, so its row (wa-row) includes one short
// phrase (みずをのむ) instead of a single word to demonstrate real usage.
export const WORDS_BY_ROW: Record<string, AnchorWord[]> = {
  'a-row': [
    { id: 'a-ai', kana: 'あい', romaji: 'ai', meaning: 'love', emoji: '❤️', characterIds: ['a', 'i'] },
    { id: 'a-ie', kana: 'いえ', romaji: 'ie', meaning: 'house', emoji: '🏠', characterIds: ['i', 'e'] },
    { id: 'a-ue', kana: 'うえ', romaji: 'ue', meaning: 'up / above', emoji: '⬆️', characterIds: ['u', 'e'] },
    { id: 'a-ao', kana: 'あお', romaji: 'ao', meaning: 'blue', emoji: '🔵', characterIds: ['a', 'o'] },
  ],
  'ka-row': [
    { id: 'ka-aka', kana: 'あか', romaji: 'aka', meaning: 'red', emoji: '🔴', characterIds: ['a', 'ka'] },
    { id: 'ka-kao', kana: 'かお', romaji: 'kao', meaning: 'face', emoji: '😀', characterIds: ['ka', 'o'] },
    { id: 'ka-ika', kana: 'いか', romaji: 'ika', meaning: 'squid', emoji: '🦑', characterIds: ['i', 'ka'] },
    { id: 'ka-kagi', kana: 'かぎ', romaji: 'kagi', meaning: 'key', emoji: '🔑', characterIds: ['ka', 'gi'] },
    { id: 'ka-koko', kana: 'ここ', romaji: 'koko', meaning: 'here', emoji: '📍', characterIds: ['ko', 'ko'] },
    { id: 'ka-gogo', kana: 'ごご', romaji: 'gogo', meaning: 'afternoon', emoji: '🌇', characterIds: ['go', 'go'] },
    { id: 'ka-kau', kana: 'かう', romaji: 'kau', meaning: 'to buy', emoji: '🛒', characterIds: ['ka', 'u'] },
    { id: 'ka-kiku', kana: 'きく', romaji: 'kiku', meaning: 'to listen', emoji: '🎧', characterIds: ['ki', 'ku'] },
    { id: 'ka-eki', kana: 'えき', romaji: 'eki', meaning: 'station', emoji: '🚉', characterIds: ['e', 'ki'] },
    { id: 'ka-gaikoku', kana: 'がいこく', romaji: 'gaikoku', meaning: 'foreign country', emoji: '🌐', characterIds: ['ga', 'i', 'ko', 'ku'] },
  ],
  'sa-row': [
    { id: 'sa-asa', kana: 'あさ', romaji: 'asa', meaning: 'morning', emoji: '🌅', characterIds: ['a', 'sa'] },
    { id: 'sa-isu', kana: 'いす', romaji: 'isu', meaning: 'chair', emoji: '🪑', characterIds: ['i', 'su'] },
    { id: 'sa-kasa', kana: 'かさ', romaji: 'kasa', meaning: 'umbrella', emoji: '☂️', characterIds: ['ka', 'sa'] },
    { id: 'sa-suki', kana: 'すき', romaji: 'suki', meaning: 'to like', emoji: '💗', characterIds: ['su', 'ki'] },
    { id: 'sa-sekai', kana: 'せかい', romaji: 'sekai', meaning: 'world', emoji: '🌍', characterIds: ['se', 'ka', 'i'] },
    { id: 'sa-kazu', kana: 'かず', romaji: 'kazu', meaning: 'number', emoji: '🔢', characterIds: ['ka', 'zu'] },
    { id: 'sa-okashi', kana: 'おかし', romaji: 'okashi', meaning: 'snack', emoji: '🍬', characterIds: ['o', 'ka', 'shi'] },
    { id: 'sa-sake', kana: 'さけ', romaji: 'sake', meaning: 'sake (alcohol)', emoji: '🍶', characterIds: ['sa', 'ke'] },
    { id: 'sa-sushi', kana: 'すし', romaji: 'sushi', meaning: 'sushi', emoji: '🍣', characterIds: ['su', 'shi'] },
  ],
  'ta-row': [
    { id: 'ta-te', kana: 'て', romaji: 'te', meaning: 'hand', emoji: '✋', characterIds: ['te'] },
    { id: 'ta-kutsu', kana: 'くつ', romaji: 'kutsu', meaning: 'shoes', emoji: '👞', characterIds: ['ku', 'tsu'] },
    { id: 'ta-ito', kana: 'いと', romaji: 'ito', meaning: 'thread', emoji: '🧵', characterIds: ['i', 'to'] },
    { id: 'ta-chizu', kana: 'ちず', romaji: 'chizu', meaning: 'map', emoji: '🗺️', characterIds: ['chi', 'zu'] },
    { id: 'ta-tako', kana: 'たこ', romaji: 'tako', meaning: 'octopus', emoji: '🐙', characterIds: ['ta', 'ko'] },
    { id: 'ta-tsuki', kana: 'つき', romaji: 'tsuki', meaning: 'moon', emoji: '🌙', characterIds: ['tsu', 'ki'] },
    { id: 'ta-soto', kana: 'そと', romaji: 'soto', meaning: 'outside', emoji: '🌳', characterIds: ['so', 'to'] },
    { id: 'ta-uta', kana: 'うた', romaji: 'uta', meaning: 'song', emoji: '🎵', characterIds: ['u', 'ta'] },
    { id: 'ta-shigoto', kana: 'しごと', romaji: 'shigoto', meaning: 'job / work', emoji: '💼', characterIds: ['shi', 'go', 'to'] },
    { id: 'ta-chikatetsu', kana: 'ちかてつ', romaji: 'chikatetsu', meaning: 'subway', emoji: '🚇', characterIds: ['chi', 'ka', 'te', 'tsu'] },
  ],
  'na-row': [
    { id: 'na-neko', kana: 'ねこ', romaji: 'neko', meaning: 'cat', emoji: '🐱', characterIds: ['ne', 'ko'] },
    { id: 'na-inu', kana: 'いぬ', romaji: 'inu', meaning: 'dog', emoji: '🐕', characterIds: ['i', 'nu'] },
    { id: 'na-sakana', kana: 'さかな', romaji: 'sakana', meaning: 'fish', emoji: '🐟', characterIds: ['sa', 'ka', 'na'] },
    { id: 'na-natsu', kana: 'なつ', romaji: 'natsu', meaning: 'summer', emoji: '☀️', characterIds: ['na', 'tsu'] },
    { id: 'na-nani', kana: 'なに', romaji: 'nani', meaning: 'what', emoji: '❓', characterIds: ['na', 'ni'] },
    { id: 'na-kuni', kana: 'くに', romaji: 'kuni', meaning: 'country', emoji: '🌏', characterIds: ['ku', 'ni'] },
    { id: 'na-okane', kana: 'おかね', romaji: 'okane', meaning: 'money', emoji: '💰', characterIds: ['o', 'ka', 'ne'] },
    { id: 'na-niku', kana: 'にく', romaji: 'niku', meaning: 'meat', emoji: '🥩', characterIds: ['ni', 'ku'] },
  ],
  'ha-row': [
    { id: 'ha-hana', kana: 'はな', romaji: 'hana', meaning: 'flower', emoji: '🌼', characterIds: ['ha', 'na'] },
    { id: 'ha-hito', kana: 'ひと', romaji: 'hito', meaning: 'person', emoji: '🧑', characterIds: ['hi', 'to'] },
    { id: 'ha-hoshi', kana: 'ほし', romaji: 'hoshi', meaning: 'star', emoji: '⭐', characterIds: ['ho', 'shi'] },
    { id: 'ha-kutsushita', kana: 'くつした', romaji: 'kutsushita', meaning: 'socks', emoji: '🧦', characterIds: ['ku', 'tsu', 'shi', 'ta'] },
    { id: 'ha-fune', kana: 'ふね', romaji: 'fune', meaning: 'boat', emoji: '🚢', characterIds: ['fu', 'ne'] },
    { id: 'ha-buta', kana: 'ぶた', romaji: 'buta', meaning: 'pig', emoji: '🐷', characterIds: ['bu', 'ta'] },
    { id: 'ha-haha', kana: 'はは', romaji: 'haha', meaning: 'mother', emoji: '👩', characterIds: ['ha', 'ha'], audioText: '母' },
    { id: 'ha-hebi', kana: 'へび', romaji: 'hebi', meaning: 'snake', emoji: '🐍', characterIds: ['he', 'bi'] },
    { id: 'ha-soba', kana: 'そば', romaji: 'soba', meaning: 'soba noodles', emoji: '🍜', characterIds: ['so', 'ba'] },
  ],
  'ma-row': [
    { id: 'ma-mizu', kana: 'みず', romaji: 'mizu', meaning: 'water', emoji: '💧', characterIds: ['mi', 'zu'] },
    { id: 'ma-ame', kana: 'あめ', romaji: 'ame', meaning: 'rain', emoji: '🌧️', characterIds: ['a', 'me'] },
    { id: 'ma-kumo', kana: 'くも', romaji: 'kumo', meaning: 'cloud', emoji: '☁️', characterIds: ['ku', 'mo'] },
    { id: 'ma-mado', kana: 'まど', romaji: 'mado', meaning: 'window', emoji: '🪟', characterIds: ['ma', 'do'] },
    { id: 'ma-mimi', kana: 'みみ', romaji: 'mimi', meaning: 'ear', emoji: '👂', characterIds: ['mi', 'mi'] },
    { id: 'ma-tamago', kana: 'たまご', romaji: 'tamago', meaning: 'egg', emoji: '🥚', characterIds: ['ta', 'ma', 'go'] },
    { id: 'ma-kudamono', kana: 'くだもの', romaji: 'kudamono', meaning: 'fruit', emoji: '🍎', characterIds: ['ku', 'da', 'mo', 'no'] },
    { id: 'ma-namae', kana: 'なまえ', romaji: 'namae', meaning: 'name', emoji: '📛', characterIds: ['na', 'ma', 'e'] },
    { id: 'ma-nezumi', kana: 'ねずみ', romaji: 'nezumi', meaning: 'mouse', emoji: '🐭', characterIds: ['ne', 'zu', 'mi'] },
    { id: 'ma-megane', kana: 'めがね', romaji: 'megane', meaning: 'glasses', emoji: '👓', characterIds: ['me', 'ga', 'ne'] },
    { id: 'ma-tomodachi', kana: 'ともだち', romaji: 'tomodachi', meaning: 'friend', emoji: '👬', characterIds: ['to', 'mo', 'da', 'chi'] },
    { id: 'ma-sashimi', kana: 'さしみ', romaji: 'sashimi', meaning: 'sashimi', emoji: '🍣', characterIds: ['sa', 'shi', 'mi'] },
  ],
  'ya-row': [
    { id: 'ya-yama', kana: 'やま', romaji: 'yama', meaning: 'mountain', emoji: '⛰️', characterIds: ['ya', 'ma'] },
    { id: 'ya-yuki', kana: 'ゆき', romaji: 'yuki', meaning: 'snow', emoji: '❄️', characterIds: ['yu', 'ki'] },
    { id: 'ya-yasai', kana: 'やさい', romaji: 'yasai', meaning: 'vegetable', emoji: '🥦', characterIds: ['ya', 'sa', 'i'] },
    { id: 'ya-yume', kana: 'ゆめ', romaji: 'yume', meaning: 'dream', emoji: '💭', characterIds: ['yu', 'me'] },
    { id: 'ya-oyogu', kana: 'およぐ', romaji: 'oyogu', meaning: 'to swim', emoji: '🏊', characterIds: ['o', 'yo', 'gu'] },
    { id: 'ya-hayai', kana: 'はやい', romaji: 'hayai', meaning: 'fast', emoji: '🏃', characterIds: ['ha', 'ya', 'i'] },
    { id: 'ya-okonomiyaki', kana: 'おこのみやき', romaji: 'okonomiyaki', meaning: 'okonomiyaki (savory pancake)', emoji: '🥘', characterIds: ['o', 'ko', 'no', 'mi', 'ya', 'ki'] },
    { id: 'ya-takoyaki', kana: 'たこやき', romaji: 'takoyaki', meaning: 'takoyaki (octopus balls)', emoji: '🍡', characterIds: ['ta', 'ko', 'ya', 'ki'] },
  ],
  'ra-row': [
    { id: 'ra-sakura', kana: 'さくら', romaji: 'sakura', meaning: 'cherry blossom', emoji: '🌸', characterIds: ['sa', 'ku', 'ra'] },
    { id: 'ra-kuruma', kana: 'くるま', romaji: 'kuruma', meaning: 'car', emoji: '🚗', characterIds: ['ku', 'ru', 'ma'] },
    { id: 'ra-tori', kana: 'とり', romaji: 'tori', meaning: 'bird', emoji: '🐦', characterIds: ['to', 'ri'] },
    { id: 'ra-iro', kana: 'いろ', romaji: 'iro', meaning: 'color', emoji: '🎨', characterIds: ['i', 'ro'] },
    { id: 'ra-shiro', kana: 'しろ', romaji: 'shiro', meaning: 'white', emoji: '⚪', characterIds: ['shi', 'ro'] },
    { id: 'ra-sora', kana: 'そら', romaji: 'sora', meaning: 'sky', emoji: '🌤️', characterIds: ['so', 'ra'] },
    { id: 'ra-yoru', kana: 'よる', romaji: 'yoru', meaning: 'night', emoji: '🌃', characterIds: ['yo', 'ru'] },
    { id: 'ra-karaage', kana: 'からあげ', romaji: 'karaage', meaning: 'fried chicken', emoji: '🍗', characterIds: ['ka', 'ra', 'a', 'ge'] },
    { id: 'ra-misoshiru', kana: 'みそしる', romaji: 'misoshiru', meaning: 'miso soup', emoji: '🍲', characterIds: ['mi', 'so', 'shi', 'ru'] },
    { id: 'ra-onigiri', kana: 'おにぎり', romaji: 'onigiri', meaning: 'rice ball', emoji: '🍙', characterIds: ['o', 'ni', 'gi', 'ri'] },
  ],
  'wa-row': [
    { id: 'wa-watashi', kana: 'わたし', romaji: 'watashi', meaning: 'I / me', emoji: '🙋', characterIds: ['wa', 'ta', 'shi'] },
    { id: 'wa-hon', kana: 'ほん', romaji: 'hon', meaning: 'book', emoji: '📖', characterIds: ['ho', 'n'] },
    { id: 'wa-nihon', kana: 'にほん', romaji: 'nihon', meaning: 'Japan', emoji: '🇯🇵', characterIds: ['ni', 'ho', 'n'] },
    { id: 'wa-en', kana: 'えん', romaji: 'en', meaning: 'yen', emoji: '💴', characterIds: ['e', 'n'] },
    {
      id: 'wa-mizu-wo-nomu',
      kana: 'みずをのむ',
      romaji: 'mizu wo nomu',
      meaning: 'drink water (phrase — を is a particle, not part of a word)',
      emoji: '🥤',
      characterIds: ['mi', 'zu', 'wo', 'no', 'mu'],
    },
    { id: 'wa-niwatori', kana: 'にわとり', romaji: 'niwatori', meaning: 'chicken (bird)', emoji: '🐔', characterIds: ['ni', 'wa', 'to', 'ri'] },
    { id: 'wa-kanpai', kana: 'かんぱい', romaji: 'kanpai', meaning: 'cheers', emoji: '🥂', characterIds: ['ka', 'n', 'pa', 'i'] },
    { id: 'wa-tenpura', kana: 'てんぷら', romaji: 'tenpura', meaning: 'tempura', emoji: '🍤', characterIds: ['te', 'n', 'pu', 'ra'] },
    { id: 'wa-tonkatsu', kana: 'とんかつ', romaji: 'tonkatsu', meaning: 'pork cutlet', emoji: '🍖', characterIds: ['to', 'n', 'ka', 'tsu'] },
  ],
}

export const ALL_WORDS: AnchorWord[] = Object.values(WORDS_BY_ROW).flat()

export const WORDS_BY_ID: Record<string, AnchorWord> = Object.fromEntries(
  ALL_WORDS.map((w) => [w.id, w]),
)
