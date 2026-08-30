// "Hiragana Restaurant" — a standalone, repeatable, non-scored-pronunciation
// mini-game (see docs at the call site, routes/RestaurantPage.tsx). This
// data deliberately does NOT live in words.ts / WORDS_BY_ROW: Restaurant
// dishes are never taught, never unlock rows, never feed Review/SRS, and
// aren't associated with a specific hiragana row the way AnchorWord is with
// its characterIds. Keeping it in its own file/type makes that isolation
// obvious at a glance rather than relying on call sites to avoid touching
// curriculum-linked fields that don't even exist here.
export type RestaurantStageId = 'hiragana' | 'katakana' | 'other' | 'special-katakana'

export type RestaurantDish = {
  id: string
  stage: RestaurantStageId
  displayKana: string
  romaji: string
  priceYen: number
  // Accepted spoken/typed forms for this dish — kana and kanji spellings a
  // learner (or a speech-to-text engine) might plausibly produce. Matched
  // via lib/restaurantMatching.ts's normalized, longest-match-first lookup;
  // NOT used for display.
  recognitionAliases: string[]
  // No image files exist yet for any dish — every dish below intentionally
  // leaves this unset. Future convention (once real art exists):
  // public/restaurant-dishes/<stage>/<id>.webp — see components rendering
  // this data, which must always fall back to placeholderEmoji rather than
  // ever attempting a broken <img> src.
  image?: string
  placeholderEmoji: string
  requiredCategories: string[]
}

export const RESTAURANT_DISHES: RestaurantDish[] = [
  {
    id: 'sushi',
    stage: 'hiragana',
    displayKana: 'すし',
    romaji: 'sushi',
    priceYen: 680,
    recognitionAliases: ['すし', '寿司', '鮨'],
    placeholderEmoji: '🍣',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'soba',
    stage: 'hiragana',
    displayKana: 'そば',
    romaji: 'soba',
    priceYen: 650,
    recognitionAliases: ['そば', '蕎麦'],
    placeholderEmoji: '🍜',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'udon',
    stage: 'hiragana',
    displayKana: 'うどん',
    romaji: 'udon',
    priceYen: 650,
    recognitionAliases: ['うどん'],
    placeholderEmoji: '🍜',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'tenpura',
    stage: 'hiragana',
    displayKana: 'てんぷら',
    romaji: 'tenpura',
    priceYen: 900,
    recognitionAliases: ['てんぷら', '天ぷら', '天麩羅'],
    placeholderEmoji: '🍤',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'onigiri',
    stage: 'hiragana',
    displayKana: 'おにぎり',
    romaji: 'onigiri',
    priceYen: 250,
    recognitionAliases: ['おにぎり', 'お握り', '御握り'],
    placeholderEmoji: '🍙',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'yakitori',
    stage: 'hiragana',
    displayKana: 'やきとり',
    romaji: 'yakitori',
    priceYen: 480,
    recognitionAliases: ['やきとり', '焼き鳥', '焼鳥'],
    placeholderEmoji: '🍢',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'sashimi',
    stage: 'hiragana',
    displayKana: 'さしみ',
    romaji: 'sashimi',
    priceYen: 980,
    recognitionAliases: ['さしみ', '刺身'],
    placeholderEmoji: '🐟',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'tonkatsu',
    stage: 'hiragana',
    displayKana: 'とんかつ',
    romaji: 'tonkatsu',
    priceYen: 950,
    recognitionAliases: ['とんかつ', 'トンカツ', '豚カツ'],
    placeholderEmoji: '🍱',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'oden',
    stage: 'hiragana',
    displayKana: 'おでん',
    romaji: 'oden',
    priceYen: 580,
    recognitionAliases: ['おでん'],
    placeholderEmoji: '🍢',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'edamame',
    stage: 'hiragana',
    displayKana: 'えだまめ',
    romaji: 'edamame',
    priceYen: 380,
    recognitionAliases: ['えだまめ', '枝豆'],
    placeholderEmoji: '🫛',
    requiredCategories: ['hiragana'],
  },
  {
    id: 'misoshiru',
    stage: 'hiragana',
    displayKana: 'みそしる',
    romaji: 'misoshiru',
    priceYen: 300,
    recognitionAliases: ['みそしる', '味噌汁', 'みそ汁'],
    placeholderEmoji: '🍲',
    requiredCategories: ['hiragana'],
  },
]

export const HIRAGANA_RESTAURANT_DISHES = RESTAURANT_DISHES.filter((d) => d.stage === 'hiragana')
