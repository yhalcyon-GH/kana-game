// Restaurant ordering game — a standalone, repeatable, non-scored-pronunciation
// mini-game (see docs at the call site, routes/RestaurantPage.tsx). This
// data deliberately does NOT live in words.ts / WORDS_BY_ROW: Restaurant
// dishes are never taught, never unlock rows, never feed Review/SRS, and
// aren't associated with a specific hiragana row the way AnchorWord is with
// its characterIds. Keeping it in its own file/type makes that isolation
// obvious at a glance rather than relying on call sites to avoid touching
// curriculum-linked fields that don't even exist here.
export type RestaurantStageId = 'hiragana' | 'katakana' | 'other' | 'special-katakana'

// Which mini-game a dish's active pool feeds — Restaurant (image-supported,
// speech/romaji ordering) or Cafe (Katakana-only, no image clue before the
// answer — see routes/games/CafePage.tsx). A dish only ever belongs to one
// checkpoint's spotlight, but the SAME dish id can be reused as filler by a
// later checkpoint of either kind (Issue #160: "Restaurant/Cafe overlap is
// flexible, not prohibited").
export type PracticeMode = 'restaurant' | 'cafe'

// Type-only in the other direction (practiceCheckpoints.ts imports
// PracticeMode/RestaurantStageId from here via `import type`, which the
// compiler erases), so importing the runtime checkpoint list/order back
// here is not a circular dependency at runtime.
import { PRACTICE_CHECKPOINTS, PRACTICE_CHECKPOINTS_BY_ID } from './practiceCheckpoints'

// An additional (checkpoint, mode) pair at which a dish becomes eligible as
// a session TARGET, beyond the implicit pair its own `checkpointId` already
// grants (see getTargetIntroductions below). Two cases need this (Issue
// #166): (a) a legacy pre-#160 dish (no `checkpointId`) that the finalized
// checkpoint roadmap reuses as an actual target once its required kana/rule
// is genuinely taught — readability is NOT the same as pedagogical
// introduction, so this is curated by hand rather than inferred from the
// dish's raw `stage`; (b) a dish already tagged for one mode that is ALSO
// approved for reuse as a target in the OTHER mode from a later checkpoint
// on (e.g. ココア/ソーセージ: Restaurant from katakana-sa-row, also Cafe
// from katakana-ha-row on — "Restaurant/Cafe overlap is flexible, not
// prohibited").
export type TargetIntroduction = { checkpointId: string; mode: PracticeMode }

export type RestaurantDish = {
  id: string
  stage: RestaurantStageId
  displayKana: string
  english: string
  romaji: string
  priceYen: number
  // Accepted spoken/typed forms for this dish — kana and kanji spellings a
  // learner (or a speech-to-text engine) might plausibly produce. Matched
  // via lib/restaurantMatching.ts's normalized, longest-match-first lookup;
  // NOT used for display.
  recognitionAliases: string[]
  // Existing vocabulary art is reused when available; new Restaurant art is
  // stored under public/restaurant-dishes/<stage>/<id>.webp. Cafe never
  // shows this before an answer (see CafePage.tsx) but does show it in the
  // post-answer reveal, same field either way.
  image?: string
  audioPath: string
  placeholderEmoji: string
  requiredCategories: string[]
  // Which checkpoint this dish is a NEW spotlight item for (see
  // data/practiceCheckpoints.ts). Undefined for older dishes that predate
  // the checkpoint roadmap (Issue #160) — those remain usable as filler
  // everywhere their stage already allowed, unaffected by this field.
  checkpointId?: string
  // See TargetIntroduction above. Empty/undefined for the common case (a
  // dish is only ever a target via its own `checkpointId`, or never a
  // target at all, remaining filler-only).
  targetIntroductions?: TargetIntroduction[]
}

const imageById: Record<string, string> = {
  sushi: 'word-icons/sa-sushi.webp', soba: 'word-icons/ha-soba.webp', tenpura: 'word-icons/ra-tenpura.webp', onigiri: 'word-icons/ra-onigiri.webp', sashimi: 'word-icons/ma-sashimi.webp', tonkatsu: 'word-icons/ta-tonkatsu.webp', misoshiru: 'word-icons/ra-misoshiru.webp',
  karee: 'word-icons/katakana-ra-karee.webp', pasuta: 'word-icons/katakana-ha-pasuta.webp', sarada: 'word-icons/katakana-ra-sarada.webp', piza: 'word-icons/katakana-ha-piza.webp',
  koohii: 'word-icons/chouon-katakana-koohii.webp', koora: 'word-icons/chouon-katakana-koora.webp', aisu: 'word-icons/katakana-sa-aisu.webp', keeki: 'word-icons/katakana-a-keeki.webp', gyouza: 'word-icons/youon-ka-gyouza.webp', mirukutii: 'word-icons/special-katakana-fa-mirukutii.webp',
}
// Restaurant 1's 7 new dishes (Issue #158) had no art/audio when first
// added; every id here has since gained real illustration art (PR #164's
// image drop — see the mapping in restaurantDishes.test.ts) EXCEPT the ones
// still listed below. Listed here so dish() can skip guessing an `image`
// path for a still-pending id and fall straight to the existing
// missing-image behavior (DishGlyph's placeholderEmoji fallback in
// routes/games/RestaurantPage.tsx / CafePage.tsx) instead of pointing at a
// public/ file that doesn't exist yet. Remove an id from this set once its
// real restaurant-dishes/<stage>/<id>.webp lands.
const PENDING_ASSET_IDS = new Set<string>([])
const placeholderById: Record<string, string> = {
  udon: '🍲', yakitori: '🍗', oden: '🍢', edamame: '🫛', purin: '🍮', zerii: '🍧', suupu: '🥣', hanbaagaa: '🍔', suteeki: '🥩', poteto: '🍟', raamen: '🍜', miruku: '🥛', hotto: '☕', 'hotto-doggu': '🌭', sandoicchi: '🥪', 'hanbaagaa-setto': '🍔➕', korokke: '🥔', kukkii: '🍪', 'hotto-kokoa': '☕🍫', toufu: '🧈', chaahan: '🍳', shichuu: '🍲🥕', kaferate: '☕🥛', 'orenji-juusu': '🍊🥤', ryokucha: '🍵', pafe: '🍨🍓', tiramisu: '🍰☕', 'choko-aisu': '🍫🍨',
  katsudon: '🍚', unagi: '🐟', dango: '🍡', tendon: '🍤', kaisendon: '🍣', unidon: '🐚', kani: '🦀',
  yakisoba: '🍜', okonomiyaki: '🥞', tamagoyaki: '🍳', karaage: '🍗',
  kokoa: '☕', sooseeji: '🌭', uisukii: '🥃',
  toosuto: '🍞', chiizu: '🧀', doonatsu: '🍩', chiizukeeki: '🍰', pankeeki: '🥞',
  furaidochikin: '🍗', teriyakichikin: '🍖', biiru: '🍺', wain: '🍷', haibooru: '🧊',
  waffuru: '🧇', esupuresso: '☕', appurupai: '🥧',
  soumen: '🍜', kakigoori: '🍧', yakitoumorokoshi: '🌽',
  gyuudon: '🍚', shuumai: '🥟', kyuuri: '🥒', koucha: '🍵', nihonshu: '🍶',
  remontii: '🍋', mineraruwootaa: '💧',
}
const englishById: Record<string, string> = {
  sushi: 'sushi', soba: 'soba noodles', udon: 'udon noodles', tenpura: 'tempura', onigiri: 'rice ball', yakitori: 'grilled chicken skewers', sashimi: 'sashimi', tonkatsu: 'pork cutlet', oden: 'Japanese stew', edamame: 'edamame', misoshiru: 'miso soup', karee: 'curry', pasuta: 'pasta', sarada: 'salad', piza: 'pizza', suupu: 'soup', hanbaagaa: 'hamburger', suteeki: 'steak', poteto: 'French fries', raamen: 'ramen', koohii: 'coffee', koora: 'cola', miruku: 'milk', purin: 'pudding', zerii: 'jelly', aisu: 'ice cream', keeki: 'cake', 'hotto-doggu': 'hot dog', sandoicchi: 'sandwich', 'hanbaagaa-setto': 'hamburger set', korokke: 'croquette', kukkii: 'cookie', 'hotto-kokoa': 'hot cocoa', toufu: 'tofu', chaahan: 'fried rice', gyouza: 'dumplings', shichuu: 'stew', kaferate: 'cafe latte', mirukutii: 'milk tea', 'orenji-juusu': 'orange juice', ryokucha: 'green tea', pafe: 'parfait', tiramisu: 'tiramisu', 'choko-aisu': 'chocolate ice cream',
  katsudon: 'pork cutlet rice bowl', unagi: 'eel', dango: 'dango', tendon: 'tempura rice bowl', kaisendon: 'seafood rice bowl', unidon: 'sea urchin rice bowl', kani: 'crab',
  yakisoba: 'fried noodles', okonomiyaki: 'savory pancake', tamagoyaki: 'rolled omelet', karaage: 'fried chicken',
  kokoa: 'cocoa', sooseeji: 'sausage', uisukii: 'whiskey',
  toosuto: 'toast', chiizu: 'cheese', doonatsu: 'donut', chiizukeeki: 'cheesecake', pankeeki: 'pancake',
  furaidochikin: 'fried chicken', teriyakichikin: 'teriyaki chicken', biiru: 'beer', wain: 'wine', haibooru: 'highball',
  waffuru: 'waffle', esupuresso: 'espresso', appurupai: 'apple pie',
  soumen: 'thin cold noodles', kakigoori: 'shaved ice', yakitoumorokoshi: 'grilled corn',
  gyuudon: 'beef rice bowl', shuumai: 'shumai dumplings', kyuuri: 'cucumber', koucha: 'black tea', nihonshu: 'sake',
  remontii: 'lemon tea', mineraruwootaa: 'mineral water',
}
// Explicit image/audio path overrides for dishes whose asset doesn't follow
// the default restaurant-dishes/<stage>/<id>.webp / audio/restaurant/<stage>/
// <id>.mp3 convention. Empty for now — てりやきチキン used to reuse the
// existing チキン illustration here, but PR #164's image drop supplied a
// dedicated てりやきチキン illustration (restaurant-dishes/katakana/
// teriyakichikin.webp), which already matches the default convention, so no
// override is needed for it anymore.
const assetOverridesById: Partial<Record<string, { image?: string; audioPath?: string }>> = {}
// Issue #166's audited, finalized reuse-as-target decisions. "Existing/reuse"
// in Issue #160 meant "already existed in the data", NOT "already introduced
// to the learner" — several of these predate the checkpoint roadmap (built
// via the legacy `build()` below, so they carry no `checkpointId`) but
// require kana/rules the learner doesn't actually have until a LATER
// checkpoint than their raw `stage` would suggest (see
// checkpointDishPool.test.ts's readability audit). Each entry names the
// EARLIEST checkpoint (and mode) at which the dish is both genuinely
// readable and approved for reuse as an actual session target, not just a
// menu filler. A dish already carrying its own `checkpointId` only needs an
// entry here for a deliberate CROSS-mode reuse (e.g. ココア/ソーセージ,
// approved as Restaurant targets from their own katakana-sa-row checkpoint,
// are ALSO approved as Cafe targets once katakana-ha-row is reached).
const targetIntroductionsById: Partial<Record<string, TargetIntroduction[]>> = {
  soba: [{ checkpointId: 'hiragana-complete', mode: 'restaurant' }],
  tenpura: [{ checkpointId: 'hiragana-complete', mode: 'restaurant' }],
  onigiri: [{ checkpointId: 'hiragana-complete', mode: 'restaurant' }],
  yakitori: [{ checkpointId: 'hiragana-complete', mode: 'restaurant' }],
  sashimi: [{ checkpointId: 'hiragana-complete', mode: 'restaurant' }],
  edamame: [{ checkpointId: 'hiragana-complete', mode: 'restaurant' }],
  misoshiru: [{ checkpointId: 'hiragana-complete', mode: 'restaurant' }],
  aisu: [{ checkpointId: 'katakana-sa-row', mode: 'restaurant' }, { checkpointId: 'katakana-ha-row', mode: 'cafe' }],
  keeki: [{ checkpointId: 'katakana-sa-row', mode: 'restaurant' }, { checkpointId: 'katakana-ha-row', mode: 'cafe' }],
  karee: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  pasuta: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }, { checkpointId: 'katakana-ha-row', mode: 'cafe' }],
  sarada: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  piza: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }, { checkpointId: 'katakana-ha-row', mode: 'cafe' }],
  suupu: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  hanbaagaa: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  suteeki: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  poteto: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  raamen: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  koora: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  miruku: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  purin: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  zerii: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }],
  koohii: [{ checkpointId: 'katakana-complete', mode: 'restaurant' }, { checkpointId: 'katakana-ha-row', mode: 'cafe' }],
  kokoa: [{ checkpointId: 'katakana-ha-row', mode: 'cafe' }],
  sooseeji: [{ checkpointId: 'katakana-ha-row', mode: 'cafe' }],
  'hotto-doggu': [{ checkpointId: 'sokuon-complete', mode: 'cafe' }],
  sandoicchi: [{ checkpointId: 'sokuon-complete', mode: 'cafe' }],
  kukkii: [{ checkpointId: 'sokuon-complete', mode: 'cafe' }],
  'hanbaagaa-setto': [{ checkpointId: 'sokuon-complete', mode: 'cafe' }],
  korokke: [{ checkpointId: 'chouon-complete', mode: 'restaurant' }],
  'hotto-kokoa': [{ checkpointId: 'chouon-complete', mode: 'restaurant' }],
  toufu: [{ checkpointId: 'chouon-complete', mode: 'restaurant' }],
  gyouza: [{ checkpointId: 'hiragana-youon-complete', mode: 'restaurant' }],
  ryokucha: [{ checkpointId: 'hiragana-youon-complete', mode: 'restaurant' }],
  chaahan: [{ checkpointId: 'katakana-youon-complete', mode: 'restaurant' }],
  shichuu: [{ checkpointId: 'katakana-youon-complete', mode: 'restaurant' }],
  'orenji-juusu': [{ checkpointId: 'katakana-youon-complete', mode: 'restaurant' }],
  'choko-aisu': [{ checkpointId: 'katakana-youon-complete', mode: 'restaurant' }],
  kaferate: [{ checkpointId: 'special-katakana-complete', mode: 'cafe' }],
  mirukutii: [{ checkpointId: 'special-katakana-complete', mode: 'cafe' }],
  pafe: [{ checkpointId: 'special-katakana-complete', mode: 'cafe' }],
  tiramisu: [{ checkpointId: 'special-katakana-complete', mode: 'cafe' }],
}
function dish(stage: RestaurantStageId, id: string, displayKana: string, romaji: string, priceYen: number, recognitionAliases: string[], checkpointId?: string): RestaurantDish {
  const overrides = assetOverridesById[id]
  return {
    id, stage, displayKana, english: englishById[id] ?? displayKana, romaji, priceYen, recognitionAliases,
    placeholderEmoji: placeholderById[id] ?? '🍽️',
    requiredCategories: [stage],
    targetIntroductions: targetIntroductionsById[id],
    image: overrides?.image ?? (PENDING_ASSET_IDS.has(id) ? undefined : (imageById[id] ?? `restaurant-dishes/${stage}/${id}.webp`)),
    audioPath: overrides?.audioPath ?? `/audio/restaurant/${stage}/${id}.mp3`,
    checkpointId,
  }
}
// Restaurant 1 (Issue #158): the first early real-life checkpoint, placed
// right after な行 — every dish below is readable using only kana taught
// through na-row (see curriculum.test.ts's cross-check). そば/てんぷら/
// おにぎり/やきとり/さしみ/えだまめ/みそしる need later rows (は/や/ら-row
// kana) and moved out of this active pool; their existing art/audio stay on
// disk for a later Restaurant checkpoint to reuse (see docs in the issue).
const h: [string, string, string, number, string[], string][] = [
  ['sushi','すし','sushi',680,['すし','寿司','鮨'],'na-row'],
  ['udon','うどん','udon',650,['うどん'],'na-row'],
  ['tonkatsu','とんかつ','tonkatsu',950,['とんかつ','トンカツ','豚カツ','豚かつ'],'na-row'],
  ['katsudon','かつどん','katsudon',900,['かつどん','カツ丼','かつ丼'],'na-row'],
  ['oden','おでん','oden',580,['おでん'],'na-row'],
  ['unagi','うなぎ','unagi',1600,['うなぎ','ウナギ','鰻'],'na-row'],
  ['dango','だんご','dango',350,['だんご','団子'],'na-row'],
  ['tendon','てんどん','tendon',980,['てんどん','天丼','てん丼'],'na-row'],
  ['kaisendon','かいせんどん','kaisendon',1480,['かいせんどん','海鮮丼','かいせん丼'],'na-row'],
  ['unidon','うにどん','unidon',1800,['うにどん','ウニ丼','うに丼','雲丹丼'],'na-row'],
  ['kani','かに','kani',680,['かに','カニ','蟹'],'na-row'],
]
// Hiragana complete → Restaurant (Issue #160, checkpoint 2): every dish is
// spellable in plain hiragana using the full hiragana base set.
const hLegacyReuse: (string | number | string[])[][] = [
  ['soba','そば','soba',650,['そば','蕎麦']], ['tenpura','てんぷら','tenpura',900,['てんぷら','天ぷら','天麩羅']], ['onigiri','おにぎり','onigiri',250,['おにぎり','お握り','御握り']],
  ['yakitori','やきとり','yakitori',480,['やきとり','焼き鳥','焼鳥']], ['sashimi','さしみ','sashimi',980,['さしみ','刺身']], ['edamame','えだまめ','edamame',380,['えだまめ','枝豆']], ['misoshiru','みそしる','misoshiru',420,['みそしる','味噌汁']],
]
const hComplete: [string, string, string, number, string[], string][] = [
  ['yakisoba','やきそば','yakisoba',680,['やきそば','焼きそば'],'hiragana-complete'],
  ['okonomiyaki','おこのみやき','okonomiyaki',900,['おこのみやき','お好み焼き'],'hiragana-complete'],
  ['tamagoyaki','たまごやき','tamagoyaki',450,['たまごやき','卵焼き','玉子焼き'],'hiragana-complete'],
  ['karaage','からあげ','karaage',580,['からあげ','唐揚げ','空揚げ'],'hiragana-complete'],
]
const k = [['karee','カレー','karee',780,['カレー','かれー','カレエ','カレーライス']],['pasuta','パスタ','pasuta',850,['パスタ','ぱすた']],['sarada','サラダ','sarada',480,['サラダ','さらだ']],['piza','ピザ','piza',980,['ピザ','ぴざ']],['suupu','スープ','suupu',380,['スープ','すーぷ']],['hanbaagaa','ハンバーガー','hanbaagaa',650,['ハンバーガー','はんばーがー']],['suteeki','ステーキ','suteeki',1480,['ステーキ','すてーき']],['poteto','ポテト','poteto',350,['ポテト','ぽてと','フライドポテト']],['raamen','ラーメン','raamen',750,['ラーメン','らーめん','拉麺']],['koohii','コーヒー','koohii',350,['コーヒー','こーひー','珈琲']],['koora','コーラ','koora',300,['コーラ','こーら']],['miruku','ミルク','miruku',280,['ミルク','みるく','牛乳']],['purin','プリン','purin',380,['プリン','ぷりん']],['zerii','ゼリー','zerii',350,['ゼリー','ぜりー']],['aisu','アイス','aisu',350,['アイス','あいす','アイスクリーム']],['keeki','ケーキ','keeki',480,['ケーキ','けーき']]]
// Katakana after Sa row → Restaurant (Issue #160, checkpoint 3).
const kSa: [string, string, string, number, string[], string][] = [
  ['kokoa','ココア','kokoa',380,['ココア','ここあ'],'katakana-sa-row'],
  ['sooseeji','ソーセージ','sooseeji',420,['ソーセージ','そーせーじ'],'katakana-sa-row'],
  ['uisukii','ウイスキー','uisukii',780,['ウイスキー','ういすきー'],'katakana-sa-row'],
]
// Katakana after Ha row → Cafe (Issue #160, checkpoint 4) — the first Cafe
// checkpoint; every dish here is Katakana-only per Cafe's own constraint.
const kHaCafe: [string, string, string, number, string[], string][] = [
  ['toosuto','トースト','toosuto',350,['トースト','とーすと'],'katakana-ha-row'],
  ['chiizu','チーズ','chiizu',380,['チーズ','ちーず'],'katakana-ha-row'],
  ['doonatsu','ドーナツ','doonatsu',280,['ドーナツ','どーなつ'],'katakana-ha-row'],
  ['chiizukeeki','チーズケーキ','chiizukeeki',520,['チーズケーキ','ちーずけーき'],'katakana-ha-row'],
  ['pankeeki','パンケーキ','pankeeki',580,['パンケーキ','ぱんけーき'],'katakana-ha-row'],
]
// Katakana complete → Restaurant (Issue #160, checkpoint 5). チキン is
// renamed to てりやきチキン per the issue's approved correction (reuses the
// existing チキン art/audio, see assetOverridesById above) rather than kept
// as a separate id.
const kComplete: [string, string, string, number, string[], string][] = [
  ['teriyakichikin','てりやきチキン','teriyakichikin',780,['てりやきチキン','照り焼きチキン'],'katakana-complete'],
  ['furaidochikin','フライドチキン','furaidochikin',680,['フライドチキン','ふらいどちきん'],'katakana-complete'],
  ['biiru','ビール','biiru',500,['ビール','びーる'],'katakana-complete'],
  ['wain','ワイン','wain',600,['ワイン','わいん'],'katakana-complete'],
  ['haibooru','ハイボール','haibooru',550,['ハイボール','はいぼーる'],'katakana-complete'],
]
const o = [['hotto-doggu','ホットドッグ','hottodoggu',520,['ホットドッグ','ほっとどっぐ','ホットドック']],['sandoicchi','サンドイッチ','sandoicchi',580,['サンドイッチ','さんどいっち']],['hanbaagaa-setto','ハンバーガーセット','hanbaagaa setto',980,['ハンバーガーセット','はんばーがーせっと']],['korokke','コロッケ','korokke',250,['コロッケ','ころっけ']],['kukkii','クッキー','kukkii',300,['クッキー','くっきー']],['hotto-kokoa','ホットココア','hotto kokoa',380,['ホットココア','ほっとここあ']],['toufu','とうふ','toufu',350,['とうふ','豆腐']]]
// Sokuon complete → Cafe (Issue #160, checkpoint 6).
const sokuonCafe: [string, string, string, number, string[], string][] = [
  ['waffuru','ワッフル','waffuru',480,['ワッフル','わっふる'],'sokuon-complete'],
  ['esupuresso','エスプレッソ','esupuresso',380,['エスプレッソ','えすぷれっそ'],'sokuon-complete'],
  ['appurupai','アップルパイ','appurupai',520,['アップルパイ','あっぷるぱい'],'sokuon-complete'],
]
// Chōon complete → Restaurant (Issue #160, checkpoint 7) — reinforces
// Hiragana long-vowel spelling rules; all three are plain hiragana.
const chouonComplete: [string, string, string, number, string[], string][] = [
  ['soumen','そうめん','soumen',580,['そうめん','素麺'],'chouon-complete'],
  ['kakigoori','かきごおり','kakigoori',450,['かきごおり','かき氷'],'chouon-complete'],
  ['yakitoumorokoshi','やきとうもろこし','yakitoumorokoshi',400,['やきとうもろこし','焼きとうもろこし'],'chouon-complete'],
]
// Hiragana Yōon complete → Restaurant (Issue #160, checkpoint 8). きゃべつ
// and おちゃ are explicitly NOT adopted per the issue's final correction.
const hiraganaYouonComplete: [string, string, string, number, string[], string][] = [
  ['gyuudon','ぎゅうどん','gyuudon',680,['ぎゅうどん','牛丼'],'hiragana-youon-complete'],
  ['shuumai','しゅうまい','shuumai',450,['しゅうまい','焼売'],'hiragana-youon-complete'],
  ['kyuuri','きゅうり','kyuuri',280,['きゅうり','胡瓜'],'hiragana-youon-complete'],
  ['koucha','こうちゃ','koucha',380,['こうちゃ','紅茶'],'hiragana-youon-complete'],
  ['nihonshu','にほんしゅ','nihonshu',600,['にほんしゅ','日本酒'],'hiragana-youon-complete'],
]
// Special Katakana complete → Cafe (Issue #160, checkpoint 10, per the
// issue's FINAL correction comment — ウォッカ is explicitly NOT adopted;
// ミネラルウォーター replaces it as the new Special Katakana Cafe item).
const specialKatakanaCafe: [string, string, string, number, string[], string][] = [
  ['remontii','レモンティー','remontii',420,['レモンティー','れもんてぃー'],'special-katakana-complete'],
  ['mineraruwootaa','ミネラルウォーター','mineraruwootaa',300,['ミネラルウォーター','みねらるうぉーたー'],'special-katakana-complete'],
]
const s = [['chaahan','チャーハン','chaahan',750,['チャーハン','ちゃーはん','炒飯']],['gyouza','ぎょうざ','gyouza',480,['ぎょうざ','ギョーザ','餃子']],['shichuu','シチュー','shichuu',850,['シチュー','しちゅー']],['kaferate','カフェラテ','kaferate',420,['カフェラテ','かふぇらて','カフェ・ラテ']],['mirukutii','ミルクティー','mirukutii',420,['ミルクティー','みるくてぃー','ミルクティ']],['orenji-juusu','オレンジジュース','orenji juusu',350,['オレンジジュース','おれんじじゅーす']],['ryokucha','りょくちゃ','ryokucha',300,['りょくちゃ','緑茶','リョクチャ']],['pafe','パフェ','pafe',780,['パフェ','ぱふぇ']],['tiramisu','ティラミス','tiramisu',520,['ティラミス','てぃらみす']],['choko-aisu','チョコアイス','choko aisu',380,['チョコアイス','ちょこあいす','チョコレートアイス']]]
function build(stage: RestaurantStageId, rows: (string | number | string[])[][]): RestaurantDish[] {
  return rows.map((r) => dish(stage, r[0] as string, r[1] as string, r[2] as string, r[3] as number, r[4] as string[]))
}
function buildWithCheckpoint(stage: RestaurantStageId, rows: [string, string, string, number, string[], string][]): RestaurantDish[] {
  return rows.map((r) => dish(stage, r[0], r[1], r[2], r[3], r[4], r[5]))
}
export const RESTAURANT_DISHES = [
  ...buildWithCheckpoint('hiragana', h),
  ...build('hiragana', hLegacyReuse),
  ...buildWithCheckpoint('hiragana', hComplete),
  ...build('katakana', k),
  ...buildWithCheckpoint('katakana', kSa),
  ...buildWithCheckpoint('katakana', kHaCafe),
  ...buildWithCheckpoint('katakana', kComplete),
  ...build('other', o),
  ...buildWithCheckpoint('other', sokuonCafe),
  ...buildWithCheckpoint('other', chouonComplete),
  ...buildWithCheckpoint('other', hiraganaYouonComplete),
  ...build('special-katakana', s),
  ...buildWithCheckpoint('special-katakana', specialKatakanaCafe),
]
export const KATAKANA_RESTAURANT_DISHES = RESTAURANT_DISHES.filter((d) => d.stage === 'katakana')
export const OTHER_RESTAURANT_DISHES = RESTAURANT_DISHES.filter((d) => d.stage === 'other')
export const SPECIAL_KATAKANA_RESTAURANT_DISHES = RESTAURANT_DISHES.filter((d) => d.stage === 'special-katakana')

export const HIRAGANA_RESTAURANT_DISHES = RESTAURANT_DISHES.filter((d) => d.stage === 'hiragana')

// Every (checkpoint, mode) pair at which `dish` becomes eligible as a
// session TARGET, in no particular order: the implicit pair from its own
// `checkpointId` (if any) plus its curated `targetIntroductions` overrides
// (see targetIntroductionsById above). Used by lib/checkpointDishPool.ts to
// build each checkpoint's cumulative same-mode target pool (Issue #166).
export function getTargetIntroductions(dish: RestaurantDish): TargetIntroduction[] {
  const owner = dish.checkpointId ? PRACTICE_CHECKPOINTS_BY_ID[dish.checkpointId] : undefined
  const implicit: TargetIntroduction[] = owner ? [{ checkpointId: owner.id, mode: owner.mode }] : []
  return [...implicit, ...(dish.targetIntroductions ?? [])]
}

// True if `dish` has become a target for `mode` at or before the checkpoint
// whose order is `maxOrder` (an index into PRACTICE_CHECKPOINTS; defaults to
// "ever", i.e. eligible for `mode` at all, regardless of checkpoint).
export function isTargetEligibleFor(dish: RestaurantDish, mode: PracticeMode, maxOrder: number = Infinity): boolean {
  return getTargetIntroductions(dish).some((introduction) => {
    if (introduction.mode !== mode) return false
    const order = PRACTICE_CHECKPOINTS.findIndex((c) => c.id === introduction.checkpointId)
    return order !== -1 && order <= maxOrder
  })
}

// Every dish ever eligible as a Cafe target, at any Cafe checkpoint —
// mainly a lookup convenience for tests/consumers, not itself a per-
// checkpoint pool (see lib/checkpointDishPool.ts for the actual per-
// checkpoint cumulative Cafe target pool).
export const CAFE_DISHES = RESTAURANT_DISHES.filter((d) => isTargetEligibleFor(d, 'cafe'))

// True if every character in `displayKana` is katakana, ー (chōon mark), or
// ッ (sokuon mark) — Cafe's own hard constraint (Issue #160: "Cafe is
// Katakana-only"). Some `other`-stage Restaurant dishes mix in hiragana
// (e.g. とうふ), so Cafe's filler pool must filter on this directly rather
// than trusting stage membership alone — a stage can hold a mix.
export function isKatakanaOnlyDish(dish: RestaurantDish): boolean {
  return [...dish.displayKana].every((ch) => (ch >= 'ァ' && ch <= 'ヶ') || ch === 'ー' || ch === 'ッ' || ch === '・')
}
