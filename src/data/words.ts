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
    { id: 'a-ai', kana: 'あい', romaji: 'ai', meaning: 'love', image: 'word-icons/a-ai.png', characterIds: ['a', 'i'] },
    { id: 'a-ie', kana: 'いえ', romaji: 'ie', meaning: 'house', image: 'word-icons/a-ie.png', characterIds: ['i', 'e'] },
    { id: 'a-ue', kana: 'うえ', romaji: 'ue', meaning: 'up / above', image: 'word-icons/a-ue.png', characterIds: ['u', 'e'] },
    { id: 'a-ao', kana: 'あお', romaji: 'ao', meaning: 'blue', image: 'word-icons/a-ao.png', characterIds: ['a', 'o'] },
  ],
  'ka-row': [
    { id: 'ka-aka', kana: 'あか', romaji: 'aka', meaning: 'red', image: 'word-icons/ka-aka.png', characterIds: ['a', 'ka'] },
    { id: 'ka-kao', kana: 'かお', romaji: 'kao', meaning: 'face', image: 'word-icons/ka-kao.png', characterIds: ['ka', 'o'] },
    { id: 'ka-ika', kana: 'いか', romaji: 'ika', meaning: 'squid', image: 'word-icons/ka-ika.png', characterIds: ['i', 'ka'] },
    { id: 'ka-kagi', kana: 'かぎ', romaji: 'kagi', meaning: 'key', image: 'word-icons/ka-kagi.png', characterIds: ['ka', 'gi'] },
    { id: 'ka-koko', kana: 'ここ', romaji: 'koko', meaning: 'here', image: 'word-icons/ka-koko.png', characterIds: ['ko', 'ko'] },
    { id: 'ka-gogo', kana: 'ごご', romaji: 'gogo', meaning: 'afternoon', image: 'word-icons/ka-gogo.png', characterIds: ['go', 'go'] },
    { id: 'ka-kau', kana: 'かう', romaji: 'kau', meaning: 'to buy', image: 'word-icons/ka-kau.png', characterIds: ['ka', 'u'] },
    { id: 'ka-kiku', kana: 'きく', romaji: 'kiku', meaning: 'to listen', image: 'word-icons/ka-kiku.png', characterIds: ['ki', 'ku'] },
    { id: 'ka-eki', kana: 'えき', romaji: 'eki', meaning: 'station', image: 'word-icons/ka-eki.png', characterIds: ['e', 'ki'] },
    { id: 'ka-gaikoku', kana: 'がいこく', romaji: 'gaikoku', meaning: 'foreign country', image: 'word-icons/ka-gaikoku.png', characterIds: ['ga', 'i', 'ko', 'ku'] },
  ],
  'sa-row': [
    { id: 'sa-asa', kana: 'あさ', romaji: 'asa', meaning: 'morning', image: 'word-icons/sa-asa.png', characterIds: ['a', 'sa'] },
    { id: 'sa-isu', kana: 'いす', romaji: 'isu', meaning: 'chair', image: 'word-icons/sa-isu.png', characterIds: ['i', 'su'] },
    { id: 'sa-kasa', kana: 'かさ', romaji: 'kasa', meaning: 'umbrella', image: 'word-icons/sa-kasa.png', characterIds: ['ka', 'sa'] },
    { id: 'sa-suki', kana: 'すき', romaji: 'suki', meaning: 'to like', image: 'word-icons/sa-suki.png', characterIds: ['su', 'ki'] },
    { id: 'sa-sekai', kana: 'せかい', romaji: 'sekai', meaning: 'world', image: 'word-icons/sa-sekai.png', characterIds: ['se', 'ka', 'i'] },
    { id: 'sa-kazu', kana: 'かず', romaji: 'kazu', meaning: 'number', image: 'word-icons/sa-kazu.png', characterIds: ['ka', 'zu'] },
    { id: 'sa-okashi', kana: 'おかし', romaji: 'okashi', meaning: 'snack', image: 'word-icons/sa-okashi.png', characterIds: ['o', 'ka', 'shi'] },
    { id: 'sa-sake', kana: 'さけ', romaji: 'sake', meaning: 'sake (alcohol)', image: 'word-icons/sa-sake.png', characterIds: ['sa', 'ke'] },
    { id: 'sa-sushi', kana: 'すし', romaji: 'sushi', meaning: 'sushi', image: 'word-icons/sa-sushi.png', characterIds: ['su', 'shi'] },
  ],
  'ta-row': [
    { id: 'ta-te', kana: 'て', romaji: 'te', meaning: 'hand', image: 'word-icons/ta-te.png', characterIds: ['te'] },
    { id: 'ta-kutsu', kana: 'くつ', romaji: 'kutsu', meaning: 'shoes', image: 'word-icons/ta-kutsu.png', characterIds: ['ku', 'tsu'] },
    { id: 'ta-ito', kana: 'いと', romaji: 'ito', meaning: 'thread', image: 'word-icons/ta-ito.png', characterIds: ['i', 'to'] },
    { id: 'ta-chizu', kana: 'ちず', romaji: 'chizu', meaning: 'map', image: 'word-icons/ta-chizu.png', characterIds: ['chi', 'zu'] },
    { id: 'ta-tako', kana: 'たこ', romaji: 'tako', meaning: 'octopus', image: 'word-icons/ta-tako.png', characterIds: ['ta', 'ko'] },
    { id: 'ta-tsuki', kana: 'つき', romaji: 'tsuki', meaning: 'moon', image: 'word-icons/ta-tsuki.png', characterIds: ['tsu', 'ki'] },
    { id: 'ta-soto', kana: 'そと', romaji: 'soto', meaning: 'outside', image: 'word-icons/ta-soto.png', characterIds: ['so', 'to'] },
    { id: 'ta-uta', kana: 'うた', romaji: 'uta', meaning: 'song', image: 'word-icons/ta-uta.png', characterIds: ['u', 'ta'] },
    { id: 'ta-shigoto', kana: 'しごと', romaji: 'shigoto', meaning: 'job / work', image: 'word-icons/ta-shigoto.png', characterIds: ['shi', 'go', 'to'] },
    { id: 'ta-chikatetsu', kana: 'ちかてつ', romaji: 'chikatetsu', meaning: 'subway', image: 'word-icons/ta-chikatetsu.png', characterIds: ['chi', 'ka', 'te', 'tsu'] },
  ],
  'na-row': [
    { id: 'na-neko', kana: 'ねこ', romaji: 'neko', meaning: 'cat', image: 'word-icons/na-neko.png', characterIds: ['ne', 'ko'] },
    { id: 'na-inu', kana: 'いぬ', romaji: 'inu', meaning: 'dog', image: 'word-icons/na-inu.png', characterIds: ['i', 'nu'] },
    { id: 'na-sakana', kana: 'さかな', romaji: 'sakana', meaning: 'fish', image: 'word-icons/na-sakana.png', characterIds: ['sa', 'ka', 'na'] },
    { id: 'na-natsu', kana: 'なつ', romaji: 'natsu', meaning: 'summer', image: 'word-icons/na-natsu.png', characterIds: ['na', 'tsu'] },
    { id: 'na-nani', kana: 'なに', romaji: 'nani', meaning: 'what', image: 'word-icons/na-nani.png', characterIds: ['na', 'ni'] },
    { id: 'na-kuni', kana: 'くに', romaji: 'kuni', meaning: 'country', image: 'word-icons/na-kuni.png', characterIds: ['ku', 'ni'] },
    { id: 'na-okane', kana: 'おかね', romaji: 'okane', meaning: 'money', image: 'word-icons/na-okane.png', characterIds: ['o', 'ka', 'ne'] },
    { id: 'na-niku', kana: 'にく', romaji: 'niku', meaning: 'meat', image: 'word-icons/na-niku.png', characterIds: ['ni', 'ku'] },
  ],
  'ha-row': [
    { id: 'ha-hana', kana: 'はな', romaji: 'hana', meaning: 'flower', image: 'word-icons/ha-hana.png', characterIds: ['ha', 'na'] },
    { id: 'ha-hito', kana: 'ひと', romaji: 'hito', meaning: 'person', image: 'word-icons/ha-hito.png', characterIds: ['hi', 'to'] },
    { id: 'ha-hoshi', kana: 'ほし', romaji: 'hoshi', meaning: 'star', image: 'word-icons/ha-hoshi.png', characterIds: ['ho', 'shi'] },
    { id: 'ha-kutsushita', kana: 'くつした', romaji: 'kutsushita', meaning: 'socks', image: 'word-icons/ha-kutsushita.png', characterIds: ['ku', 'tsu', 'shi', 'ta'] },
    { id: 'ha-fune', kana: 'ふね', romaji: 'fune', meaning: 'boat', image: 'word-icons/ha-fune.png', characterIds: ['fu', 'ne'] },
    { id: 'ha-buta', kana: 'ぶた', romaji: 'buta', meaning: 'pig', image: 'word-icons/ha-buta.png', characterIds: ['bu', 'ta'] },
    { id: 'ha-haha', kana: 'はは', romaji: 'haha', meaning: 'mother', image: 'word-icons/ha-haha.png', characterIds: ['ha', 'ha'], audioText: '母' },
    { id: 'ha-hebi', kana: 'へび', romaji: 'hebi', meaning: 'snake', image: 'word-icons/ha-hebi.png', characterIds: ['he', 'bi'] },
    { id: 'ha-soba', kana: 'そば', romaji: 'soba', meaning: 'soba noodles', image: 'word-icons/ha-soba.png', characterIds: ['so', 'ba'] },
  ],
  'ma-row': [
    { id: 'ma-mizu', kana: 'みず', romaji: 'mizu', meaning: 'water', image: 'word-icons/ma-mizu.png', characterIds: ['mi', 'zu'] },
    { id: 'ma-ame', kana: 'あめ', romaji: 'ame', meaning: 'rain', image: 'word-icons/ma-ame.png', characterIds: ['a', 'me'] },
    { id: 'ma-kumo', kana: 'くも', romaji: 'kumo', meaning: 'cloud', image: 'word-icons/ma-kumo.png', characterIds: ['ku', 'mo'] },
    { id: 'ma-mado', kana: 'まど', romaji: 'mado', meaning: 'window', image: 'word-icons/ma-mado.png', characterIds: ['ma', 'do'] },
    { id: 'ma-mimi', kana: 'みみ', romaji: 'mimi', meaning: 'ear', image: 'word-icons/ma-mimi.png', characterIds: ['mi', 'mi'] },
    { id: 'ma-tamago', kana: 'たまご', romaji: 'tamago', meaning: 'egg', image: 'word-icons/ma-tamago.png', characterIds: ['ta', 'ma', 'go'] },
    { id: 'ma-kudamono', kana: 'くだもの', romaji: 'kudamono', meaning: 'fruit', image: 'word-icons/ma-kudamono.png', characterIds: ['ku', 'da', 'mo', 'no'] },
    { id: 'ma-namae', kana: 'なまえ', romaji: 'namae', meaning: 'name', image: 'word-icons/ma-namae.png', characterIds: ['na', 'ma', 'e'] },
    { id: 'ma-nezumi', kana: 'ねずみ', romaji: 'nezumi', meaning: 'mouse', image: 'word-icons/ma-nezumi.png', characterIds: ['ne', 'zu', 'mi'] },
    { id: 'ma-megane', kana: 'めがね', romaji: 'megane', meaning: 'glasses', image: 'word-icons/ma-megane.png', characterIds: ['me', 'ga', 'ne'] },
    { id: 'ma-tomodachi', kana: 'ともだち', romaji: 'tomodachi', meaning: 'friend', image: 'word-icons/ma-tomodachi.png', characterIds: ['to', 'mo', 'da', 'chi'] },
    { id: 'ma-sashimi', kana: 'さしみ', romaji: 'sashimi', meaning: 'sashimi', image: 'word-icons/ma-sashimi.png', characterIds: ['sa', 'shi', 'mi'] },
  ],
  'ya-row': [
    { id: 'ya-yama', kana: 'やま', romaji: 'yama', meaning: 'mountain', image: 'word-icons/ya-yama.png', characterIds: ['ya', 'ma'] },
    { id: 'ya-yuki', kana: 'ゆき', romaji: 'yuki', meaning: 'snow', image: 'word-icons/ya-yuki.png', characterIds: ['yu', 'ki'] },
    { id: 'ya-yasai', kana: 'やさい', romaji: 'yasai', meaning: 'vegetable', image: 'word-icons/ya-yasai.png', characterIds: ['ya', 'sa', 'i'] },
    { id: 'ya-yume', kana: 'ゆめ', romaji: 'yume', meaning: 'dream', image: 'word-icons/ya-yume.png', characterIds: ['yu', 'me'] },
    { id: 'ya-oyogu', kana: 'およぐ', romaji: 'oyogu', meaning: 'to swim', image: 'word-icons/ya-oyogu.png', characterIds: ['o', 'yo', 'gu'] },
    { id: 'ya-hayai', kana: 'はやい', romaji: 'hayai', meaning: 'fast', image: 'word-icons/ya-hayai.png', characterIds: ['ha', 'ya', 'i'] },
    { id: 'ya-okonomiyaki', kana: 'おこのみやき', romaji: 'okonomiyaki', meaning: 'okonomiyaki (savory pancake)', image: 'word-icons/ya-okonomiyaki.png', characterIds: ['o', 'ko', 'no', 'mi', 'ya', 'ki'] },
    { id: 'ya-takoyaki', kana: 'たこやき', romaji: 'takoyaki', meaning: 'takoyaki (octopus balls)', image: 'word-icons/ya-takoyaki.png', characterIds: ['ta', 'ko', 'ya', 'ki'] },
  ],
  'ra-row': [
    { id: 'ra-sakura', kana: 'さくら', romaji: 'sakura', meaning: 'cherry blossom', image: 'word-icons/ra-sakura.png', characterIds: ['sa', 'ku', 'ra'] },
    { id: 'ra-kuruma', kana: 'くるま', romaji: 'kuruma', meaning: 'car', image: 'word-icons/ra-kuruma.png', characterIds: ['ku', 'ru', 'ma'] },
    { id: 'ra-tori', kana: 'とり', romaji: 'tori', meaning: 'bird', image: 'word-icons/ra-tori.png', characterIds: ['to', 'ri'] },
    { id: 'ra-iro', kana: 'いろ', romaji: 'iro', meaning: 'color', image: 'word-icons/ra-iro.png', characterIds: ['i', 'ro'] },
    { id: 'ra-shiro', kana: 'しろ', romaji: 'shiro', meaning: 'white', image: 'word-icons/ra-shiro.png', characterIds: ['shi', 'ro'] },
    { id: 'ra-sora', kana: 'そら', romaji: 'sora', meaning: 'sky', image: 'word-icons/ra-sora.png', characterIds: ['so', 'ra'] },
    { id: 'ra-yoru', kana: 'よる', romaji: 'yoru', meaning: 'night', image: 'word-icons/ra-yoru.png', characterIds: ['yo', 'ru'] },
    { id: 'ra-karaage', kana: 'からあげ', romaji: 'karaage', meaning: 'fried chicken', image: 'word-icons/ra-karaage.png', characterIds: ['ka', 'ra', 'a', 'ge'] },
    { id: 'ra-misoshiru', kana: 'みそしる', romaji: 'misoshiru', meaning: 'miso soup', image: 'word-icons/ra-misoshiru.png', characterIds: ['mi', 'so', 'shi', 'ru'] },
    { id: 'ra-onigiri', kana: 'おにぎり', romaji: 'onigiri', meaning: 'rice ball', image: 'word-icons/ra-onigiri.png', characterIds: ['o', 'ni', 'gi', 'ri'] },
  ],
  'wa-row': [
    { id: 'wa-watashi', kana: 'わたし', romaji: 'watashi', meaning: 'I / me', image: 'word-icons/wa-watashi.png', characterIds: ['wa', 'ta', 'shi'] },
    { id: 'wa-hon', kana: 'ほん', romaji: 'hon', meaning: 'book', image: 'word-icons/wa-hon.png', characterIds: ['ho', 'n'] },
    { id: 'wa-nihon', kana: 'にほん', romaji: 'nihon', meaning: 'Japan', image: 'word-icons/wa-nihon.png', characterIds: ['ni', 'ho', 'n'] },
    { id: 'wa-en', kana: 'えん', romaji: 'en', meaning: 'yen', image: 'word-icons/wa-en.png', characterIds: ['e', 'n'] },
    {
      id: 'wa-mizu-wo-nomu',
      kana: 'みずをのむ',
      romaji: 'mizu wo nomu',
      meaning: 'drink water (phrase — を is a particle, not part of a word)',
      image: 'word-icons/wa-mizu-wo-nomu.png',
      characterIds: ['mi', 'zu', 'wo', 'no', 'mu'],
    },
    { id: 'wa-niwatori', kana: 'にわとり', romaji: 'niwatori', meaning: 'chicken (bird)', image: 'word-icons/wa-niwatori.png', characterIds: ['ni', 'wa', 'to', 'ri'] },
    { id: 'wa-kanpai', kana: 'かんぱい', romaji: 'kanpai', meaning: 'cheers', image: 'word-icons/wa-kanpai.png', characterIds: ['ka', 'n', 'pa', 'i'] },
    { id: 'wa-tenpura', kana: 'てんぷら', romaji: 'tenpura', meaning: 'tempura', image: 'word-icons/wa-tenpura.png', characterIds: ['te', 'n', 'pu', 'ra'] },
    { id: 'wa-tonkatsu', kana: 'とんかつ', romaji: 'tonkatsu', meaning: 'pork cutlet', image: 'word-icons/wa-tonkatsu.png', characterIds: ['to', 'n', 'ka', 'tsu'] },
  ],
}

export const ALL_WORDS: AnchorWord[] = Object.values(WORDS_BY_ROW).flat()

export const WORDS_BY_ID: Record<string, AnchorWord> = Object.fromEntries(
  ALL_WORDS.map((w) => [w.id, w]),
)
