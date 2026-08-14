// Pre-generates every character and word pronunciation clip (public/audio/
// characters/<id>.wav, public/audio/words/<id>.wav) with a dedicated
// ElevenLabs narrator voice — distinct from Tamamizu (the mascot's voice,
// used only for in-game feedback lines; see scripts/generateFeedbackAudio
// -related history and project_kana_game_elevenlabs_voice memory). This
// voice was chosen specifically for clear, well-enunciated pronunciation
// since that's what a kana-learning app actually needs, and replaces both
// the previous COEIROINK word audio and the real-human character
// recordings.
//
// Text sent to the API is `word.audioText ?? word.kana` for words (see
// src/data/words.ts's audioText comment for why bare kana is often the
// wrong input) and the bare kana character for single kana.
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateAudioElevenLabs.ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CHARACTERS } from '../src/data/characters'
import { ALL_WORDS } from '../src/data/words'

const VOICE_ID = 'LX07LNNrSwlByKloPCtW' // narrator voice — distinct from Tamamizu
const MODEL_ID = 'eleven_v3'
const OUT_DIR = path.resolve(import.meta.dirname, '../public/audio')
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
  console.log(`Generating ${CHARACTERS.length} character clips...`)
  await generateAll(
    'characters',
    CHARACTERS.map((c) => ({ id: c.id, text: c.kana })),
  )

  console.log(`Generating ${ALL_WORDS.length} word clips...`)
  await generateAll(
    'words',
    ALL_WORDS.map((w) => ({ id: w.id, text: w.audioText ?? w.kana })),
  )

  console.log('Done.')
}

main()
