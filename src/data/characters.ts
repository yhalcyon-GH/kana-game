import type { KanaChar } from './types'

// All 71 hiragana characters used in the MVP: 46 base (gojuon, incl. ん,
// excl. obsolete ゐ/ゑ) + 20 dakuten + 5 handakuten. Dakuten/handakuten
// characters are grouped under the same rowId as their base row, since the
// curriculum teaches them together (see curriculum.ts).
export const CHARACTERS: KanaChar[] = [
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
}
