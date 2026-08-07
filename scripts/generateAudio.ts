// Pre-generates つくよみちゃん (COEIROINK) audio for every character and word
// in the curriculum, so the deployed app can ship static audio files
// instead of depending on a locally-running COEIROINK engine at playback
// time. Run once (whenever the curriculum data changes) with a local
// COEIROINK v2 engine running on the default port:
//   npx tsx scripts/generateAudio.ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CHARACTERS } from '../src/data/characters'
import { ALL_WORDS } from '../src/data/words'

const COEIROINK_BASE_URL = 'http://localhost:50032'
const COEIROINK_SPEAKER_UUID = '3c37646f-3881-5374-2a83-149267990abc' // つくよみちゃん
const COEIROINK_STYLE_ID = 0 // れいせい (calm)
const OUT_DIR = path.resolve(import.meta.dirname, '../public/audio')

async function synthesize(text: string): Promise<Buffer> {
  const res = await fetch(`${COEIROINK_BASE_URL}/v1/synthesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      speakerUuid: COEIROINK_SPEAKER_UUID,
      styleId: COEIROINK_STYLE_ID,
      text,
      speedScale: 1.0,
      volumeScale: 1.0,
      pitchScale: 0.0,
      intonationScale: 1.0,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.1,
      outputSamplingRate: 24000,
    }),
  })
  if (!res.ok) throw new Error(`synthesis failed (${res.status}) for "${text}": ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
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
  const speakersRes = await fetch(`${COEIROINK_BASE_URL}/v1/speakers`).catch(() => null)
  if (!speakersRes?.ok) {
    console.error('COEIROINK engine is not reachable at ' + COEIROINK_BASE_URL)
    console.error('Start the COEIROINK app first, then re-run this script.')
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
