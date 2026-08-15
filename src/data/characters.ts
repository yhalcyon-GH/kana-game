import type { KanaChar } from './types'

// All 71 hiragana characters used in the MVP: 46 base (gojuon, incl. ん,
// excl. obsolete ゐ/ゑ) + 20 dakuten + 5 handakuten. Dakuten/handakuten
// characters are grouped under the same rowId as their base row, since the
// curriculum teaches them together (see curriculum.ts).
export const CHARACTERS: KanaChar[] = [
  // ===== ひらがな (hiragana) =====
  // あ行
  { id: 'a', kana: 'あ', romaji: 'a', rowId: 'a-row', type: 'base' },
  { id: 'i', kana: 'い', romaji: 'i', rowId: 'a-row', type: 'base' },
  { id: 'u', kana: 'う', romaji: 'u', rowId: 'a-row', type: 'base' },
  { id: 'e', kana: 'え', romaji: 'e', rowId: 'a-row', type: 'base' },
  { id: 'o', kana: 'お', romaji: 'o', rowId: 'a-row', type: 'base' },

  // か行
  { id: 'ka', kana: 'か', romaji: 'ka', rowId: 'ka-row', type: 'base' },
  { id: 'ki', kana: 'き', romaji: 'ki', rowId: 'ka-row', type: 'base' },
  { id: 'ku', kana: 'く', romaji: 'ku', rowId: 'ka-row', type: 'base' },
  { id: 'ke', kana: 'け', romaji: 'ke', rowId: 'ka-row', type: 'base' },
  { id: 'ko', kana: 'こ', romaji: 'ko', rowId: 'ka-row', type: 'base' },
  // が行 (taught together with か行)
  { id: 'ga', kana: 'が', romaji: 'ga', rowId: 'ka-row', type: 'dakuten' },
  { id: 'gi', kana: 'ぎ', romaji: 'gi', rowId: 'ka-row', type: 'dakuten' },
  { id: 'gu', kana: 'ぐ', romaji: 'gu', rowId: 'ka-row', type: 'dakuten' },
  { id: 'ge', kana: 'げ', romaji: 'ge', rowId: 'ka-row', type: 'dakuten' },
  { id: 'go', kana: 'ご', romaji: 'go', rowId: 'ka-row', type: 'dakuten' },

  // さ行
  { id: 'sa', kana: 'さ', romaji: 'sa', rowId: 'sa-row', type: 'base' },
  { id: 'shi', kana: 'し', romaji: 'shi', rowId: 'sa-row', type: 'base' },
  { id: 'su', kana: 'す', romaji: 'su', rowId: 'sa-row', type: 'base' },
  { id: 'se', kana: 'せ', romaji: 'se', rowId: 'sa-row', type: 'base' },
  { id: 'so', kana: 'そ', romaji: 'so', rowId: 'sa-row', type: 'base' },
  // ざ行 (taught together with さ行)
  { id: 'za', kana: 'ざ', romaji: 'za', rowId: 'sa-row', type: 'dakuten' },
  { id: 'ji', kana: 'じ', romaji: 'ji', rowId: 'sa-row', type: 'dakuten' },
  { id: 'zu', kana: 'ず', romaji: 'zu', rowId: 'sa-row', type: 'dakuten' },
  { id: 'ze', kana: 'ぜ', romaji: 'ze', rowId: 'sa-row', type: 'dakuten' },
  { id: 'zo', kana: 'ぞ', romaji: 'zo', rowId: 'sa-row', type: 'dakuten' },

  // た行
  { id: 'ta', kana: 'た', romaji: 'ta', rowId: 'ta-row', type: 'base' },
  { id: 'chi', kana: 'ち', romaji: 'chi', rowId: 'ta-row', type: 'base' },
  { id: 'tsu', kana: 'つ', romaji: 'tsu', rowId: 'ta-row', type: 'base' },
  { id: 'te', kana: 'て', romaji: 'te', rowId: 'ta-row', type: 'base' },
  { id: 'to', kana: 'と', romaji: 'to', rowId: 'ta-row', type: 'base' },
  // だ行 (taught together with た行). ぢ/づ are romanized the same as じ/ず
  // in modern Hepburn, so ids are disambiguated ('dji'/'dzu') while the
  // displayed romaji stays 'ji'/'zu'.
  { id: 'da', kana: 'だ', romaji: 'da', rowId: 'ta-row', type: 'dakuten' },
  { id: 'dji', kana: 'ぢ', romaji: 'ji', rowId: 'ta-row', type: 'dakuten' },
  { id: 'dzu', kana: 'づ', romaji: 'zu', rowId: 'ta-row', type: 'dakuten' },
  { id: 'de', kana: 'で', romaji: 'de', rowId: 'ta-row', type: 'dakuten' },
  { id: 'do', kana: 'ど', romaji: 'do', rowId: 'ta-row', type: 'dakuten' },

  // な行 (no dakuten)
  { id: 'na', kana: 'な', romaji: 'na', rowId: 'na-row', type: 'base' },
  { id: 'ni', kana: 'に', romaji: 'ni', rowId: 'na-row', type: 'base' },
  { id: 'nu', kana: 'ぬ', romaji: 'nu', rowId: 'na-row', type: 'base' },
  { id: 'ne', kana: 'ね', romaji: 'ne', rowId: 'na-row', type: 'base' },
  { id: 'no', kana: 'の', romaji: 'no', rowId: 'na-row', type: 'base' },

  // は行
  { id: 'ha', kana: 'は', romaji: 'ha', rowId: 'ha-row', type: 'base' },
  { id: 'hi', kana: 'ひ', romaji: 'hi', rowId: 'ha-row', type: 'base' },
  { id: 'fu', kana: 'ふ', romaji: 'fu', rowId: 'ha-row', type: 'base' },
  { id: 'he', kana: 'へ', romaji: 'he', rowId: 'ha-row', type: 'base' },
  { id: 'ho', kana: 'ほ', romaji: 'ho', rowId: 'ha-row', type: 'base' },
  // ば行 + ぱ行 (both taught together with は行)
  { id: 'ba', kana: 'ば', romaji: 'ba', rowId: 'ha-row', type: 'dakuten' },
  { id: 'bi', kana: 'び', romaji: 'bi', rowId: 'ha-row', type: 'dakuten' },
  { id: 'bu', kana: 'ぶ', romaji: 'bu', rowId: 'ha-row', type: 'dakuten' },
  { id: 'be', kana: 'べ', romaji: 'be', rowId: 'ha-row', type: 'dakuten' },
  { id: 'bo', kana: 'ぼ', romaji: 'bo', rowId: 'ha-row', type: 'dakuten' },
  { id: 'pa', kana: 'ぱ', romaji: 'pa', rowId: 'ha-row', type: 'handakuten' },
  { id: 'pi', kana: 'ぴ', romaji: 'pi', rowId: 'ha-row', type: 'handakuten' },
  { id: 'pu', kana: 'ぷ', romaji: 'pu', rowId: 'ha-row', type: 'handakuten' },
  { id: 'pe', kana: 'ぺ', romaji: 'pe', rowId: 'ha-row', type: 'handakuten' },
  { id: 'po', kana: 'ぽ', romaji: 'po', rowId: 'ha-row', type: 'handakuten' },

  // ま行 (no dakuten)
  { id: 'ma', kana: 'ま', romaji: 'ma', rowId: 'ma-row', type: 'base' },
  { id: 'mi', kana: 'み', romaji: 'mi', rowId: 'ma-row', type: 'base' },
  { id: 'mu', kana: 'む', romaji: 'mu', rowId: 'ma-row', type: 'base' },
  { id: 'me', kana: 'め', romaji: 'me', rowId: 'ma-row', type: 'base' },
  { id: 'mo', kana: 'も', romaji: 'mo', rowId: 'ma-row', type: 'base' },

  // や行 (3 characters only, no dakuten)
  { id: 'ya', kana: 'や', romaji: 'ya', rowId: 'ya-row', type: 'base' },
  { id: 'yu', kana: 'ゆ', romaji: 'yu', rowId: 'ya-row', type: 'base' },
  { id: 'yo', kana: 'よ', romaji: 'yo', rowId: 'ya-row', type: 'base' },

  // ら行 (no dakuten)
  { id: 'ra', kana: 'ら', romaji: 'ra', rowId: 'ra-row', type: 'base' },
  { id: 'ri', kana: 'り', romaji: 'ri', rowId: 'ra-row', type: 'base' },
  { id: 'ru', kana: 'る', romaji: 'ru', rowId: 'ra-row', type: 'base' },
  { id: 're', kana: 'れ', romaji: 're', rowId: 'ra-row', type: 'base' },
  { id: 'ro', kana: 'ろ', romaji: 'ro', rowId: 'ra-row', type: 'base' },

  // わ行 + ん (final row, no dakuten)
  { id: 'wa', kana: 'わ', romaji: 'wa', rowId: 'wa-row', type: 'base' },
  { id: 'wo', kana: 'を', romaji: 'wo', rowId: 'wa-row', type: 'base' },
  { id: 'n', kana: 'ん', romaji: 'n', rowId: 'wa-row', type: 'base' },

  // ===== カタカナ (katakana) =====
  // Same 71-character set as hiragana (46 base + 20 dakuten + 5 handakuten),
  // plus ー (chōon/long-vowel mark) as one extra character — see
  // docs/curriculum-extensibility.md. All ids are 'katakana-' prefixed
  // since they'd otherwise collide with the hiragana ids above (both
  // scripts share the same romaji, e.g. hiragana 'ka' vs katakana 'ka').
  // ア行 — also carries ー (chōon) and ン from the very first row (see
  // curriculum.ts's katakana-a-row comment for why: without them, almost
  // no real katakana word is constructible from vowels alone, and both
  // are needed constantly throughout every later row's realistic
  // vocabulary — no reason to make the learner wait until the last row
  // for either).
  { id: 'katakana-a', kana: 'ア', romaji: 'a', rowId: 'katakana-a-row', type: 'base' },
  { id: 'katakana-i', kana: 'イ', romaji: 'i', rowId: 'katakana-a-row', type: 'base' },
  { id: 'katakana-u', kana: 'ウ', romaji: 'u', rowId: 'katakana-a-row', type: 'base' },
  { id: 'katakana-e', kana: 'エ', romaji: 'e', rowId: 'katakana-a-row', type: 'base' },
  { id: 'katakana-o', kana: 'オ', romaji: 'o', rowId: 'katakana-a-row', type: 'base' },
  // ー (chōon / long-vowel mark) — not a mora of its own; extends the
  // preceding vowel sound (see words.ts's katakana-a-row comment for how
  // that's represented in romaji). Romaji '-' is a placeholder reading,
  // not a real pronunciation — flagged for the user's sign-off.
  { id: 'katakana-chouon', kana: 'ー', romaji: '-', rowId: 'katakana-a-row', type: 'base' },
  { id: 'katakana-n', kana: 'ン', romaji: 'n', rowId: 'katakana-a-row', type: 'base' },

  // カ行
  { id: 'katakana-ka', kana: 'カ', romaji: 'ka', rowId: 'katakana-ka-row', type: 'base' },
  { id: 'katakana-ki', kana: 'キ', romaji: 'ki', rowId: 'katakana-ka-row', type: 'base' },
  { id: 'katakana-ku', kana: 'ク', romaji: 'ku', rowId: 'katakana-ka-row', type: 'base' },
  { id: 'katakana-ke', kana: 'ケ', romaji: 'ke', rowId: 'katakana-ka-row', type: 'base' },
  { id: 'katakana-ko', kana: 'コ', romaji: 'ko', rowId: 'katakana-ka-row', type: 'base' },
  // ガ行 (taught together with カ行)
  { id: 'katakana-ga', kana: 'ガ', romaji: 'ga', rowId: 'katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-gi', kana: 'ギ', romaji: 'gi', rowId: 'katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-gu', kana: 'グ', romaji: 'gu', rowId: 'katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-ge', kana: 'ゲ', romaji: 'ge', rowId: 'katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-go', kana: 'ゴ', romaji: 'go', rowId: 'katakana-ka-row', type: 'dakuten' },

  // サ行
  { id: 'katakana-sa', kana: 'サ', romaji: 'sa', rowId: 'katakana-sa-row', type: 'base' },
  { id: 'katakana-shi', kana: 'シ', romaji: 'shi', rowId: 'katakana-sa-row', type: 'base' },
  { id: 'katakana-su', kana: 'ス', romaji: 'su', rowId: 'katakana-sa-row', type: 'base' },
  { id: 'katakana-se', kana: 'セ', romaji: 'se', rowId: 'katakana-sa-row', type: 'base' },
  { id: 'katakana-so', kana: 'ソ', romaji: 'so', rowId: 'katakana-sa-row', type: 'base' },
  // ザ行 (taught together with サ行)
  { id: 'katakana-za', kana: 'ザ', romaji: 'za', rowId: 'katakana-sa-row', type: 'dakuten' },
  { id: 'katakana-ji', kana: 'ジ', romaji: 'ji', rowId: 'katakana-sa-row', type: 'dakuten' },
  { id: 'katakana-zu', kana: 'ズ', romaji: 'zu', rowId: 'katakana-sa-row', type: 'dakuten' },
  { id: 'katakana-ze', kana: 'ゼ', romaji: 'ze', rowId: 'katakana-sa-row', type: 'dakuten' },
  { id: 'katakana-zo', kana: 'ゾ', romaji: 'zo', rowId: 'katakana-sa-row', type: 'dakuten' },

  // タ行
  { id: 'katakana-ta', kana: 'タ', romaji: 'ta', rowId: 'katakana-ta-row', type: 'base' },
  { id: 'katakana-chi', kana: 'チ', romaji: 'chi', rowId: 'katakana-ta-row', type: 'base' },
  { id: 'katakana-tsu', kana: 'ツ', romaji: 'tsu', rowId: 'katakana-ta-row', type: 'base' },
  { id: 'katakana-te', kana: 'テ', romaji: 'te', rowId: 'katakana-ta-row', type: 'base' },
  { id: 'katakana-to', kana: 'ト', romaji: 'to', rowId: 'katakana-ta-row', type: 'base' },
  // ダ行 (taught together with タ行). ヂ/ヅ mirror hiragana's ぢ/づ id
  // disambiguation ('dji'/'dzu') — see characters.ts's hiragana section.
  { id: 'katakana-da', kana: 'ダ', romaji: 'da', rowId: 'katakana-ta-row', type: 'dakuten' },
  { id: 'katakana-dji', kana: 'ヂ', romaji: 'ji', rowId: 'katakana-ta-row', type: 'dakuten' },
  { id: 'katakana-dzu', kana: 'ヅ', romaji: 'zu', rowId: 'katakana-ta-row', type: 'dakuten' },
  { id: 'katakana-de', kana: 'デ', romaji: 'de', rowId: 'katakana-ta-row', type: 'dakuten' },
  { id: 'katakana-do', kana: 'ド', romaji: 'do', rowId: 'katakana-ta-row', type: 'dakuten' },

  // ナ行 (no dakuten)
  { id: 'katakana-na', kana: 'ナ', romaji: 'na', rowId: 'katakana-na-row', type: 'base' },
  { id: 'katakana-ni', kana: 'ニ', romaji: 'ni', rowId: 'katakana-na-row', type: 'base' },
  { id: 'katakana-nu', kana: 'ヌ', romaji: 'nu', rowId: 'katakana-na-row', type: 'base' },
  { id: 'katakana-ne', kana: 'ネ', romaji: 'ne', rowId: 'katakana-na-row', type: 'base' },
  { id: 'katakana-no', kana: 'ノ', romaji: 'no', rowId: 'katakana-na-row', type: 'base' },

  // ハ行
  { id: 'katakana-ha', kana: 'ハ', romaji: 'ha', rowId: 'katakana-ha-row', type: 'base' },
  { id: 'katakana-hi', kana: 'ヒ', romaji: 'hi', rowId: 'katakana-ha-row', type: 'base' },
  { id: 'katakana-fu', kana: 'フ', romaji: 'fu', rowId: 'katakana-ha-row', type: 'base' },
  { id: 'katakana-he', kana: 'ヘ', romaji: 'he', rowId: 'katakana-ha-row', type: 'base' },
  { id: 'katakana-ho', kana: 'ホ', romaji: 'ho', rowId: 'katakana-ha-row', type: 'base' },
  // バ行 + パ行 (both taught together with ハ行)
  { id: 'katakana-ba', kana: 'バ', romaji: 'ba', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-bi', kana: 'ビ', romaji: 'bi', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-bu', kana: 'ブ', romaji: 'bu', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-be', kana: 'ベ', romaji: 'be', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-bo', kana: 'ボ', romaji: 'bo', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-pa', kana: 'パ', romaji: 'pa', rowId: 'katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-pi', kana: 'ピ', romaji: 'pi', rowId: 'katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-pu', kana: 'プ', romaji: 'pu', rowId: 'katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-pe', kana: 'ペ', romaji: 'pe', rowId: 'katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-po', kana: 'ポ', romaji: 'po', rowId: 'katakana-ha-row', type: 'handakuten' },

  // マ行 (no dakuten)
  { id: 'katakana-ma', kana: 'マ', romaji: 'ma', rowId: 'katakana-ma-row', type: 'base' },
  { id: 'katakana-mi', kana: 'ミ', romaji: 'mi', rowId: 'katakana-ma-row', type: 'base' },
  { id: 'katakana-mu', kana: 'ム', romaji: 'mu', rowId: 'katakana-ma-row', type: 'base' },
  { id: 'katakana-me', kana: 'メ', romaji: 'me', rowId: 'katakana-ma-row', type: 'base' },
  { id: 'katakana-mo', kana: 'モ', romaji: 'mo', rowId: 'katakana-ma-row', type: 'base' },

  // ヤ行 (3 characters only, no dakuten)
  { id: 'katakana-ya', kana: 'ヤ', romaji: 'ya', rowId: 'katakana-ya-row', type: 'base' },
  { id: 'katakana-yu', kana: 'ユ', romaji: 'yu', rowId: 'katakana-ya-row', type: 'base' },
  { id: 'katakana-yo', kana: 'ヨ', romaji: 'yo', rowId: 'katakana-ya-row', type: 'base' },

  // ラ行 (no dakuten)
  { id: 'katakana-ra', kana: 'ラ', romaji: 'ra', rowId: 'katakana-ra-row', type: 'base' },
  { id: 'katakana-ri', kana: 'リ', romaji: 'ri', rowId: 'katakana-ra-row', type: 'base' },
  { id: 'katakana-ru', kana: 'ル', romaji: 'ru', rowId: 'katakana-ra-row', type: 'base' },
  { id: 'katakana-re', kana: 'レ', romaji: 're', rowId: 'katakana-ra-row', type: 'base' },
  { id: 'katakana-ro', kana: 'ロ', romaji: 'ro', rowId: 'katakana-ra-row', type: 'base' },

  // ワ・ヲ — folded into ラ行 rather than kept as their own final row (ン
  // moved up to ア行, above): ワ/ヲ are otherwise the only two characters
  // left with no row of their own, and ラ~ロ is the natural place to end
  // the single-kana sequence with them. ヲ is kept for structural
  // completeness (see words.ts's katakana-ra-row comment for why, unlike
  // hiragana's を, it gets no vocabulary/phrase reinforcement).
  { id: 'katakana-wa', kana: 'ワ', romaji: 'wa', rowId: 'katakana-ra-row', type: 'base' },
  { id: 'katakana-wo', kana: 'ヲ', romaji: 'wo', rowId: 'katakana-ra-row', type: 'base' },
]

export const CHARACTERS_BY_ID: Record<string, KanaChar> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
)

// Kunrei-shiki (and other common) romanizations accepted alongside each
// character's Hepburn-based canonical romaji in CHARACTERS above — e.g. つ
// is typed as either "tsu" (Hepburn) or "tu" (Kunrei-shiki). Only characters
// where the two systems actually diverge need an entry here.
export const ROMAJI_ALTERNATES: Record<string, string[]> = {
  shi: ['si'],
  chi: ['ti'],
  tsu: ['tu'],
  ji: ['zi'],
  dji: ['di'],
  dzu: ['du'],
  fu: ['hu'],
  wo: ['o'],
  'katakana-shi': ['si'],
  'katakana-chi': ['ti'],
  'katakana-tsu': ['tu'],
  'katakana-ji': ['zi'],
  'katakana-dji': ['di'],
  'katakana-dzu': ['du'],
  'katakana-fu': ['hu'],
  'katakana-wo': ['o'],
}
