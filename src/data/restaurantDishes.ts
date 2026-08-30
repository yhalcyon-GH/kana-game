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
  audioPath: string
  placeholderEmoji: string
  requiredCategories: string[]
}

const imageById: Record<string, string> = {
  sushi: 'word-icons/sa-sushi.webp', soba: 'word-icons/ha-soba.webp', tenpura: 'word-icons/wa-tenpura.webp',
  karee: 'word-icons/katakana-ra-karee.webp', pasuta: 'word-icons/katakana-a-pasuta.webp',
  sarada: 'word-icons/katakana-sa-sarada.webp', piza: 'word-icons/katakana-ha-piza.webp',
  koohii: 'word-icons/katakana-ka-koohii.webp', koora: 'word-icons/katakana-ka-koora.webp', aisu: 'word-icons/katakana-a-aisu.webp',
  keeki: 'word-icons/katakana-ka-keeki.webp', gyouza: 'word-icons/special-katakana-ga-gyouza.webp', mirukutii: 'word-icons/special-katakana-fa-mirukutii.webp', kokoa: 'word-icons/katakana-a-kokoa.webp',
}
const emojis = ['🍣','🍜','🍲','🍤','🍙','🍗','🐟','🍱','🍢','🫛','🥣','🍛','🍝','🥗','🍕','🥤','🍔','🥩','🍟','🍗','🍜','☕','🥛','🍮','🍮','🍨','🍰','🌭','🥪','🍔','🥔','🍪','☕','🧈','🍳','🥟','🍲','☕','🧋','🍵','🍨','🍰','🍫']
function dish(stage: RestaurantStageId, id: string, displayKana: string, romaji: string, priceYen: number, recognitionAliases: string[], emoji: string): RestaurantDish {
  return { id, stage, displayKana, romaji, priceYen, recognitionAliases, placeholderEmoji: emoji, requiredCategories: [stage], image: imageById[id], audioPath: `/audio/restaurant/${stage}/${id}.wav` }
}
const h = [
  ['sushi','すし','sushi',680,['すし','寿司','鮨']],['soba','そば','soba',650,['そば','蕎麦']],['udon','うどん','udon',650,['うどん']],['tenpura','てんぷら','tenpura',900,['てんぷら','天ぷら','天麩羅']],['onigiri','おにぎり','onigiri',250,['おにぎり','お握り','御握り']],['yakitori','やきとり','yakitori',480,['やきとり','焼き鳥','焼鳥']],['sashimi','さしみ','sashimi',980,['さしみ','刺身']],['tonkatsu','とんかつ','tonkatsu',950,['とんかつ','トンカツ','豚カツ']],['oden','おでん','oden',580,['おでん']],['edamame','えだまめ','edamame',380,['えだまめ','枝豆']],['misoshiru','みそしる','misoshiru',300,['みそしる','味噌汁','みそ汁']],
]
const k = [['karee','カレー','karee',780,['カレー','かれー','カレエ','カレーライス']],['pasuta','パスタ','pasuta',850,['パスタ','ぱすた']],['sarada','サラダ','sarada',480,['サラダ','さらだ']],['piza','ピザ','piza',980,['ピザ','ぴざ']],['suupu','スープ','suupu',380,['スープ','すーぷ']],['hanbaagaa','ハンバーガー','hanbaagaa',650,['ハンバーガー','はんばーがー']],['suteeki','ステーキ','suteeki',1480,['ステーキ','すてーき']],['poteto','ポテト','poteto',350,['ポテト','ぽてと','フライドポテト']],['chikin','チキン','chikin',780,['チキン','ちきん']],['raamen','ラーメン','raamen',750,['ラーメン','らーめん','拉麺']],['koohii','コーヒー','koohii',350,['コーヒー','こーひー','珈琲']],['koora','コーラ','koora',300,['コーラ','こーら']],['miruku','ミルク','miruku',280,['ミルク','みるく','牛乳']],['purin','プリン','purin',380,['プリン','ぷりん']],['zerii','ゼリー','zerii',350,['ゼリー','ぜりー']],['aisu','アイス','aisu',350,['アイス','あいす','アイスクリーム']],['keeki','ケーキ','keeki',480,['ケーキ','けーき']]]
const o = [['hotto-doggu','ホットドッグ','hottodoggu',520,['ホットドッグ','ほっとどっぐ','ホットドック']],['sandoicchi','サンドイッチ','sandoicchi',580,['サンドイッチ','さんどいっち']],['hanbaagaa-setto','ハンバーガーセット','hanbaagaa setto',980,['ハンバーガーセット','はんばーがーせっと']],['korokke','コロッケ','korokke',250,['コロッケ','ころっけ']],['kukkii','クッキー','kukkii',300,['クッキー','くっきー']],['hotto-kokoa','ホットココア','hotto kokoa',380,['ホットココア','ほっとここあ']],['toufu','とうふ','toufu',350,['とうふ','豆腐']]]
const s = [['chaahan','チャーハン','chaahan',750,['チャーハン','ちゃーはん','炒飯']],['gyouza','ぎょうざ','gyouza',480,['ぎょうざ','ギョーザ','餃子']],['shichuu','シチュー','shichuu',850,['シチュー','しちゅー']],['kaferate','カフェラテ','kaferate',420,['カフェラテ','かふぇらて','カフェ・ラテ']],['mirukutii','ミルクティー','mirukutii',420,['ミルクティー','みるくてぃー','ミルクティ']],['orenji-juusu','オレンジジュース','orenji juusu',350,['オレンジジュース','おれんじじゅーす']],['ryokucha','りょくちゃ','ryokucha',300,['りょくちゃ','緑茶','リョクチャ']],['pafe','パフェ','pafe',780,['パフェ','ぱふぇ']],['tiramisu','ティラミス','tiramisu',520,['ティラミス','てぃらみす']],['choko-aisu','チョコアイス','choko aisu',380,['チョコアイス','ちょこあいす','チョコレートアイス']]]
function build(stage: RestaurantStageId, rows: (string | number | string[])[][], offset: number) { return rows.map((r, i) => dish(stage, r[0] as string, r[1] as string, r[2] as string, r[3] as number, r[4] as string[], emojis[offset + i] ?? '🍽️')) }
export const RESTAURANT_DISHES = [...build('hiragana', h, 0), ...build('katakana', k, 11), ...build('other', o, 28), ...build('special-katakana', s, 35)]
export const KATAKANA_RESTAURANT_DISHES = RESTAURANT_DISHES.filter((d) => d.stage === 'katakana')
export const OTHER_RESTAURANT_DISHES = RESTAURANT_DISHES.filter((d) => d.stage === 'other')
export const SPECIAL_KATAKANA_RESTAURANT_DISHES = RESTAURANT_DISHES.filter((d) => d.stage === 'special-katakana')

export const HIRAGANA_RESTAURANT_DISHES = RESTAURANT_DISHES.filter((d) => d.stage === 'hiragana')
