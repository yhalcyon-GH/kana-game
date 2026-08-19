import { CHARACTERS } from '../data/characters'

// First entry wins for any kana shared across characters (there are none in
// practice, since hiragana/katakana ids never collide on their kana field).
const KANA_TO_ROMAJI = new Map<string, string>()
for (const c of CHARACTERS) {
  if (!KANA_TO_ROMAJI.has(c.kana)) KANA_TO_ROMAJI.set(c.kana, c.romaji)
}

// Best-effort kana -> romaji for arbitrary text — used to show a learner
// what their wrong answer actually reads as (see KanaTypingPage/
// WordBuilderPage). Greedily matches the longest known kana sequence at
// each position (2 glyphs first, for yōon, then 1); anything unrecognized
// (already-romaji text, punctuation, spaces) passes through unchanged.
export function kanaToRomaji(text: string): string {
  const glyphs = [...text]
  const parts: string[] = []
  let i = 0
  while (i < glyphs.length) {
    const two = glyphs.slice(i, i + 2).join('')
    const twoRomaji = KANA_TO_ROMAJI.get(two)
    if (twoRomaji !== undefined) {
      parts.push(twoRomaji)
      i += 2
      continue
    }
    const oneRomaji = KANA_TO_ROMAJI.get(glyphs[i])
    parts.push(oneRomaji ?? glyphs[i])
    i += 1
  }
  return parts.join('')
}
