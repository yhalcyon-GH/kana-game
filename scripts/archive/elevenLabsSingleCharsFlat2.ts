// Same as elevenLabsSingleCharsFlat.ts, but for a different subset, and
// ん specifically synthesized WITHOUT a trailing "。" (per user: ん was
// coming out held/elongated too long — suspect the period-induced pause
// was making the nasal hum drag on).
import { copyFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CHARACTERS } from '../../src/data/characters'
import { MODEL_ID, OUT_DIR, pcmToWav, requireApiKey, SAMPLE_RATE } from '../elevenLabsClient'

const VOICE_ID = 'XlX7zKbP19omFrVWQ8CU'
const TARGET_ROMAJI = ['a', 'ze', 'de', 'ne', 'ho', 'bo', 'po', 'mu', 'me', 'ra', 'ru', 'ro', 'n']
const NO_PERIOD_ROMAJI = new Set(['n'])

const HIRA_ROWS = new Set(['a-row', 'ka-row', 'sa-row', 'ta-row', 'na-row', 'ha-row', 'ma-row', 'ya-row', 'ra-row', 'wa-row'])
const KATA_ROWS = new Set(['katakana-a-row', 'katakana-sa-row', 'katakana-ta-row', 'katakana-na-row', 'katakana-ha-row', 'katakana-ma-row', 'katakana-ya-row', 'katakana-ra-row'])

async function synthesizeFlat(text: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=pcm_${SAMPLE_RATE}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.9, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    }),
  })
  if (!res.ok) throw new Error(`synthesis failed (${res.status}) for "${text}": ${await res.text()}`)
  const pcm = Buffer.from(await res.arrayBuffer())
  return pcmToWav(pcm)
}

async function main() {
  const apiKey = requireApiKey()
  const hira = CHARACTERS.filter((c) => HIRA_ROWS.has(c.rowId) && TARGET_ROMAJI.includes(c.romaji))
  const kata = CHARACTERS.filter((c) => KATA_ROWS.has(c.rowId) && c.id !== 'katakana-chouon' && c.id !== 'katakana-sokuon')
  const kataByRomaji = new Map(kata.map((k) => [k.romaji, k.id]))

  for (const c of hira) {
    const outPath = path.join(OUT_DIR, 'characters', `${c.id}.wav`)
    const text = NO_PERIOD_ROMAJI.has(c.romaji) ? c.kana : `${c.kana}。`
    const wav = await synthesizeFlat(text, apiKey)
    await writeFile(outPath, wav)
    console.log(`  characters/${c.id}.wav  ("${text}")`)

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
