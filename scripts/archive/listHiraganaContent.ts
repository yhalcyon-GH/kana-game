import { CHARACTERS } from '../src/data/characters'
import { WORDS_BY_ROW } from '../src/data/words'
import { ACCENT_PATTERNS } from '../src/data/accents'

const ROWS = ['a-row', 'ka-row', 'sa-row', 'ta-row', 'na-row', 'ha-row', 'ma-row', 'ya-row', 'ra-row', 'wa-row']

let charCount = 0
let wordCount = 0
let withAccent = 0
let withAudioText = 0

for (const row of ROWS) {
  const chars = CHARACTERS.filter((c) => c.rowId === row)
  const words = WORDS_BY_ROW[row] ?? []
  charCount += chars.length
  wordCount += words.length
  for (const w of words) {
    if (ACCENT_PATTERNS[w.id]) withAccent++
    if (w.audioText) withAudioText++
  }
  console.log(`${row}: ${chars.length} chars, ${words.length} words -> ${words.map((w) => w.id).join(', ')}`)
}
console.log(`\nTotal: ${charCount} characters, ${wordCount} words`)
console.log(`Words with accent data: ${withAccent}/${wordCount}`)
console.log(`Words with audioText (kanji): ${withAudioText}/${wordCount}`)
