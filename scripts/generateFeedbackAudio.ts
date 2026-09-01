// Generates any MISSING feedback-line clips (public/audio/feedback/<id>.wav)
// with Tamamizu's ElevenLabs voice — the mascot's reaction voice, distinct
// from the narrator voice scripts/generateAudioElevenLabs.ts uses for
// character/word pronunciation (see that script's header). Skips any id
// that already has a clip on disk, so re-running this after adding a new
// line to src/data/feedback.ts only pays for the new one, never re-charges
// for lines that already have good audio.
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateFeedbackAudio.ts
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DONMAI,
  GANBATTE,
  IINE,
  KAKKOII,
  KANPEKI,
  OSHII,
  SAIKOU,
  SEIKAI,
  SUGOI,
  ZANNEN,
} from '../src/data/feedback'

const VOICE_ID = 'AhtKs6h2Q4XbfAjEfKa2' // Tamamizu — see project_kana_game_elevenlabs_voice memory
const MODEL_ID = 'eleven_v3'
const OUT_DIR = path.resolve(import.meta.dirname, '../public/audio/feedback')
const SAMPLE_RATE = 24000

const apiKey = process.env.ELEVENLABS_API_KEY
if (!apiKey) {
  console.error('Set ELEVENLABS_API_KEY first.')
  process.exit(1)
}

function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

async function synthesize(text: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=pcm_${SAMPLE_RATE}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  })
  if (!res.ok) throw new Error(`synthesis failed (${res.status}) for "${text}": ${await res.text()}`)
  const pcm = Buffer.from(await res.arrayBuffer())
  return pcmToWav(pcm)
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  const lines = [SEIKAI, SUGOI, SAIKOU, KAKKOII, KANPEKI, IINE, OSHII, DONMAI, GANBATTE, ZANNEN]
  await mkdir(OUT_DIR, { recursive: true })
  for (const { id, text } of lines) {
    const outPath = path.join(OUT_DIR, `${id}.wav`)
    const productionMp3Path = path.join(OUT_DIR, `${id}.mp3`)
    if (await exists(outPath) || await exists(productionMp3Path)) {
      console.log(`  skip ${id} (runtime clip already exists)`)
      continue
    }
    const wav = await synthesize(text)
    await writeFile(outPath, wav)
    console.log(`  wrote ${id}.wav  ("${text}")`)
  }
  console.log('Done.')
}

main()
