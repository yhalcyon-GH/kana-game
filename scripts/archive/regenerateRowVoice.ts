// One-off tool: regenerate every character + word clip for ONE row with a
// SPECIFIC ElevenLabs voice, unconditionally overwriting whatever is
// already on disk — for A/B-testing a candidate narrator voice against a
// row that already has known-good audio (e.g. hiragana's ka-row), before
// deciding whether to switch scripts/elevenLabsClient.ts's default VOICE_ID
// for everything. Does NOT touch the default voice; pass --voice to try a
// different one for just this run.
//
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/regenerateRowVoice.ts --row ka-row --voice fWZkPh6JTVXYK2vuJIbv
//
// After running, check the result with:
//   npm run check-voices -- --row ka-row
// (checks pronunciation/misreading only — NOT speed/clarity, which still
// needs a human listen; see docs/2026-08-15-voice-quality-check-design.md's
// phase-1 scope.)
import path from 'node:path'
import { CHARACTERS } from '../src/data/characters'
import { ROWS_BY_ID } from '../src/data/curriculum'
import { WORDS_BY_ROW } from '../src/data/words'
import { OUT_DIR, requireApiKey, synthesizeToFile, VOICE_ID } from './elevenLabsClient'

function parseArgs(argv: string[]) {
  const rowIndex = argv.indexOf('--row')
  const voiceIndex = argv.indexOf('--voice')
  const row = rowIndex !== -1 ? argv[rowIndex + 1] : undefined
  const voice = voiceIndex !== -1 ? argv[voiceIndex + 1] : VOICE_ID
  return { row, voice }
}

async function main() {
  const { row, voice } = parseArgs(process.argv.slice(2))
  if (!row) {
    console.error('Usage: regenerateRowVoice.ts --row <rowId> [--voice <elevenLabsVoiceId>]')
    process.exit(1)
  }
  if (!ROWS_BY_ID[row]) {
    console.error(`Unknown row "${row}".`)
    process.exit(1)
  }

  const apiKey = requireApiKey()
  const chars = CHARACTERS.filter((c) => c.rowId === row)
  const words = WORDS_BY_ROW[row] ?? []

  console.log(`Regenerating row "${row}" with voice ${voice} (${chars.length} character(s), ${words.length} word(s))...`)

  for (const c of chars) {
    const outPath = path.join(OUT_DIR, 'characters', `${c.id}.wav`)
    await synthesizeToFile(outPath, c.kana, apiKey, voice)
    console.log(`  wrote characters/${c.id}.wav  ("${c.kana}")`)
  }

  for (const w of words) {
    const text = w.audioText ?? w.kana
    const outPath = path.join(OUT_DIR, 'words', `${w.id}.wav`)
    await synthesizeToFile(outPath, text, apiKey, voice)
    console.log(`  wrote words/${w.id}.wav  ("${text}")`)
  }

  console.log('Done.')
}

main()
