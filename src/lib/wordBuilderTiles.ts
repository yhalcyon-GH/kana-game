import { CHARACTERS_BY_ID } from '../data/characters'

// Special Katakana learning-unit ids whose kana is TWO codepoints (a
// full-size kana + a small vowel, e.g. katakana-fa's ファ) but which must be
// SPELLING-SPLIT into two separate tiles in Word Builder only — unlike yōon
// (きゃ/しゃ/チャ etc.), which is also 2 codepoints but stays ONE tile. The
// character id itself remains a single Review/SRS/recognition target either
// way — WordBuilderPage always attributes correctness by charId, never by
// split part.
const SPECIAL_KATAKANA_SPLIT_IDS = new Set([
  'katakana-fa',
  'katakana-fi',
  'katakana-fe',
  'katakana-fo',
  'katakana-ti',
  'katakana-di',
  'katakana-she',
  'katakana-je',
  'katakana-che',
  'katakana-wi',
  'katakana-we',
  'katakana-special-wo',
])

// A single learning-unit character id can render as 1 display tile (the
// normal case, and yōon) or 2 (Special Katakana spelling-split, see above).
export type FlatTargetTile = { charId: string; glyph: string }

export function displayGlyphsForCharId(id: string): string[] {
  const kana = CHARACTERS_BY_ID[id]?.kana ?? ''
  return SPECIAL_KATAKANA_SPLIT_IDS.has(id) ? Array.from(kana) : [kana]
}

export function buildFlatTargetTiles(characterIds: string[]): FlatTargetTile[] {
  return characterIds.flatMap((charId) => displayGlyphsForCharId(charId).map((glyph) => ({ charId, glyph })))
}
