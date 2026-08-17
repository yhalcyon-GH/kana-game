// Small kana (ゃゅょぁぃぅぇぉ and katakana equivalents) attach to the
// preceding kana to form one mora (きゃ = 1 mora, not 2) — see CLAUDE.md's
// "one kana glyph = one mora, EXCEPT yōon" note. っ/ッ (sokuon), ー
// (chōon), and ん/ン (hatsuon) each count as their own mora and are never
// merged, matching standard Japanese mora counting. Used by
// src/lib/voiceQuality.ts to compare an ASR transcript against a word's
// expected reading mora-by-mora rather than character-by-character.
const SMALL_COMBINING = new Set([
  'ゃ', 'ゅ', 'ょ', 'ゎ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ',
  'ャ', 'ュ', 'ョ', 'ヮ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ',
])

export function toMorae(kana: string): string[] {
  const morae: string[] = []
  for (const ch of kana) {
    if (SMALL_COMBINING.has(ch) && morae.length > 0) {
      morae[morae.length - 1] += ch
    } else {
      morae.push(ch)
    }
  }
  return morae
}
