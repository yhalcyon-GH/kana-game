import { CHARACTERS_BY_ID } from '../data/characters'
import { toMorae } from './mora'

// A learning-unit character id can render as 1 display tile (the normal
// case) or 2 (SPELLING-split, Word Builder only) — a 2-codepoint id whose
// two codepoints form exactly ONE mora (see lib/mora.ts's toMorae: a small
// ゃゅょ/ャュョ/ぁぃぅぇぉ/ァィゥェォ attaches to the preceding kana rather
// than counting as its own mora). That's yōon (きゃ/しゃ/ミャ/... — base
// consonant + small ゃゅょ) AND Special Katakana (ファ/ティ/ウォ/... — base
// vowel-shifted kana + small ァィゥェォ): both are "one sound, one
// learning-unit" everywhere else in the app (Learn/Kana Quiz/Listening/
// audio/curriculum/Review/SRS all still key off the single combined
// characterId), but Word Builder splits them into their two component
// glyphs so the learner practices the actual spelling construction. A
// 2-codepoint id that ISN'T a small-kana digraph (none exist in this
// curriculum today, but nothing here assumes there never will be one)
// stays ONE tile, since toMorae would report 2 morae for it, not 1 — this
// checks the actual mora-merge condition, not raw Unicode length. The
// character id itself remains a single Review/SRS/recognition target
// either way — WordBuilderPage always attributes correctness by charId,
// never by split part (see FlatTargetTile below), and applies this same
// rule to distractor tiles too so a character never looks split in one
// role and whole in another.
export type FlatTargetTile = { charId: string; glyph: string }

export function displayGlyphsForCharId(id: string): string[] {
  const kana = CHARACTERS_BY_ID[id]?.kana ?? ''
  const chars = Array.from(kana)
  if (chars.length === 2 && toMorae(kana).length === 1) return chars
  return [kana]
}

export function buildFlatTargetTiles(characterIds: string[]): FlatTargetTile[] {
  return characterIds.flatMap((charId) => displayGlyphsForCharId(charId).map((glyph) => ({ charId, glyph })))
}
