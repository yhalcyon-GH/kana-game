import { CHARACTERS } from '../src/data/characters'
import { WORDS_BY_ROW } from '../src/data/words'
import { ACCENT_PATTERNS } from '../src/data/accents'
import { ROWS } from '../src/data/curriculum'

const HIRAGANA_ROWS = new Set(['a-row', 'ka-row', 'sa-row', 'ta-row', 'na-row', 'ha-row', 'ma-row', 'ya-row', 'ra-row', 'wa-row'])
const remainingRows = ROWS.filter((r) => !HIRAGANA_ROWS.has(r.id))

let charCount = 0
let wordCount = 0
let withAccent = 0
const noAccent: string[] = []

for (const row of remainingRows) {
  const chars = CHARACTERS.filter((c) => c.rowId === row.id)
  const words = WORDS_BY_ROW[row.id] ?? []
  charCount += chars.length
  wordCount += words.length
  for (const w of words) {
    if (ACCENT_PATTERNS[w.id]) withAccent++
    else noAccent.push(w.id)
  }
  console.log(`${row.id} (${row.categoryId}): ${chars.length} chars, ${words.length} words`)
}
console.log(`\nTotal: ${charCount} characters, ${wordCount} words`)
console.log(`Words with accent data: ${withAccent}/${wordCount}`)
console.log(`No accent data (${noAccent.length}): ${noAccent.join(', ')}`)
