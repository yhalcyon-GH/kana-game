import type { KanaChar } from '../data/types'

// あ/い/う/え/お column index (0-4) a character's reading belongs to, judged
// purely from the last letter of its romaji — this happens to be correct
// even for the irregular readings (shi/chi/tsu/fu end in i/i/u/u, and every
// yōon reading ends in a/u/o same as its contracted vowel). Returns null for
// characters with no column of their own: ん (n), and the sokuon/chōon
// placeholder characters (romaji '-').
export function vowelColumn(romaji: string): number | null {
  const last = romaji.at(-1)
  const index = ['a', 'i', 'u', 'e', 'o'].indexOf(last ?? '')
  return index === -1 ? null : index
}

export type CharacterGridRow = { columns: (KanaChar | null)[] } | { other: KanaChar[] }

// Groups a row's characters into 五十音図-style lines: each gojūon/dakuten/
// handakuten group gets its own line of 5 column slots (null where that
// group has no character for that vowel, e.g. や/ゆ/よ leaving い/え empty)
// rather than left-packing past the gap. ん and ー/っ/ッ have no column, so
// consecutive runs of those are collected into their own non-grid line
// instead. A new columns-line starts whenever the next character's column
// isn't strictly to the right of the current line's last column (covering
// both a same-group wrap like か→き→...→こ→が and any other reset).
export function groupCharactersByColumn(characters: KanaChar[]): CharacterGridRow[] {
  const rows: CharacterGridRow[] = []
  let lastColumn = -1

  for (const char of characters) {
    const col = vowelColumn(char.romaji)
    if (col === null) {
      const last = rows.at(-1)
      if (last && 'other' in last) last.other.push(char)
      else rows.push({ other: [char] })
      lastColumn = -1
      continue
    }
    let current = rows.at(-1)
    if (!current || 'other' in current || col <= lastColumn) {
      current = { columns: [null, null, null, null, null] }
      rows.push(current)
    }
    current.columns[col] = char
    lastColumn = col
  }

  return rows
}
