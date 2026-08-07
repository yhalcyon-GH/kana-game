// Pre-generates ずんだもん (VOICEVOX speaker 3) audio for every character and
// word in the curriculum, so the deployed app can ship static audio files
// instead of depending on a locally-running VOICEVOX engine at playback
// time. Run once (whenever the curriculum data changes) with a local
// VOICEVOX engine running on the default port:
//   npx tsx scripts/generateAudio.ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CHARACTERS } from '../src/data/characters'
import { ALL_WORDS } from '../src/data/words'

const VOICEVOX_BASE_URL = 'http://localhost:50021'
const VOICEVOX_SPEAKER_ID = 3 // ずんだもん・ノーマル
const OUT_DIR = path.resolve(import.meta.dirname, '../public/audio')

async function synthesize(text: string): Promise<Buffer> {
  const queryRes = await fetch(
    `${VOICEVOX_BASE_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${VOICEVOX_SPEAKER_ID}`,
    { method: 'POST' },
  )
  if (!queryRes.ok) throw new Error(`audio_query failed (${queryRes.status}) for "${text}"`)
  const query = await queryRes.json()

  const synthesisRes = await fetch(`${VOICEVOX_BASE_URL}/synthesis?speaker=${VOICEVOX_SPEAKER_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })
  if (!synthesisRes.ok) throw new Error(`synthesis failed (${synthesisRes.status}) for "${text}"`)
  return Buffer.from(await synthesisRes.arrayBuffer())
}

async function generateAll(subdir: string, items: { id: string; text: string }[]) {
  const dir = path.join(OUT_DIR, subdir)
  await mkdir(dir, { recursive: true })
  for (const { id, text } of items) {
    const wav = await synthesize(text)
    await writeFile(path.join(dir, `${id}.wav`), wav)
    console.log(`  ${subdir}/${id}.wav  ("${text}")`)
  }
}

async function main() {
  const versionRes = await fetch(`${VOICEVOX_BASE_URL}/version`).catch(() => null)
  if (!versionRes?.ok) {
    console.error('VOICEVOX engine is not reachable at ' + VOICEVOX_BASE_URL)
    console.error('Start the VOICEVOX app first, then re-run this script.')
    process.exit(1)
  }

  console.log('Generating character audio...')
  await generateAll(
    'characters',
    CHARACTERS.map((c) => ({ id: c.id, text: c.kana })),
  )

  console.log('Generating word audio...')
  await generateAll(
    'words',
    ALL_WORDS.map((w) => ({ id: w.id, text: w.audioText ?? w.kana })),
  )

  console.log('Done.')
}

main()
