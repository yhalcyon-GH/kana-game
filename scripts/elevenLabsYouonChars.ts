// 拗音 (yōon) single-character audio, same bare-kana/no-settings approach
// as elevenLabsSingleCharsRaw.ts — generates the 33 hiragana yōon
// characters and copies each to its katakana counterpart (same
// pronunciation, same convention as the base 46 characters).
import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { CHARACTERS } from '../src/data/characters'
import { OUT_DIR, requireApiKey, synthesizeToFile } from './elevenLabsClient'

const VOICE_ID = 'XlX7zKbP19omFrVWQ8CU'
const TARGET = ['cha','nya','hya','bya','pya','pyo','mya']
const YOUON_HIRA_ROWS = new Set(['youon-ka-row', 'youon-sha-row', 'youon-cha-na-row', 'youon-ha-row', 'youon-ma-ra-row'])
const YOUON_KATA_ROWS = new Set([
  'youon-katakana-ka-row',
  'youon-katakana-sha-row',
  'youon-katakana-cha-na-row',
  'youon-katakana-ha-row',
  'youon-katakana-ma-ra-row',
])

async function main() {
  const apiKey = requireApiKey()
  const hira = CHARACTERS.filter((c) => YOUON_HIRA_ROWS.has(c.rowId) && TARGET.includes(c.id))
  const kata = CHARACTERS.filter((c) => YOUON_KATA_ROWS.has(c.rowId))
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
    } else {
      console.error(`    no katakana match for romaji "${c.romaji}"`)
    }
  }
  console.log('Done.')
}

main()
