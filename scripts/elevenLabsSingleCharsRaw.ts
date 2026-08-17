// Bare/minimal single-character regeneration: no trailing punctuation, no
// custom voice_settings — just the kana character passed as-is to
// ElevenLabs (voice XlX7zKbP19omFrVWQ8CU), per user request to remove the
// extra processing tried in earlier attempts.
import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { CHARACTERS } from '../src/data/characters'
import { OUT_DIR, requireApiKey, synthesizeToFile } from './elevenLabsClient'

const VOICE_ID = 'XlX7zKbP19omFrVWQ8CU'
const TARGET_ROMAJI = ['a', 'ze', 'de', 'zo', 'ne', 'bo', 'mu', 'me', 'ra', 'ru', 'ro', 'n']

const HIRA_ROWS = new Set(['a-row', 'ka-row', 'sa-row', 'ta-row', 'na-row', 'ha-row', 'ma-row', 'ya-row', 'ra-row', 'wa-row'])
const KATA_ROWS = new Set(['katakana-a-row', 'katakana-sa-row', 'katakana-ta-row', 'katakana-na-row', 'katakana-ha-row', 'katakana-ma-row', 'katakana-ya-row', 'katakana-ra-row'])

async function main() {
  const apiKey = requireApiKey()
  const hira = CHARACTERS.filter((c) => HIRA_ROWS.has(c.rowId) && TARGET_ROMAJI.includes(c.romaji))
  const kata = CHARACTERS.filter((c) => KATA_ROWS.has(c.rowId) && c.id !== 'katakana-chouon' && c.id !== 'katakana-sokuon')
  const kataByRomaji = new Map(kata.map((k) => [k.romaji, k.id]))

  for (const c of hira) {
    const outPath = path.join(OUT_DIR, 'characters', `${c.id}.wav`)
    await synthesizeToFile(outPath, c.kana, apiKey, VOICE_ID)
    console.log(`  characters/${c.id}.wav  ("${c.kana}")`)

    const kataId = kataByRomaji.get(c.romaji)
    if (kataId) {
      const kataPath = path.join(OUT_DIR, 'characters', `${kataId}.wav`)
      await copyFile(outPath, kataPath)
      console.log(`    -> copied to characters/${kataId}.wav`)
    }
  }
  console.log('Done.')
}

main()
