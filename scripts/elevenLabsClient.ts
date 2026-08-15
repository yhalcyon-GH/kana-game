// ElevenLabs TTS client shared by scripts/generateAudioElevenLabs.ts (bulk
// character/word generation) and scripts/checkVoiceQuality.ts (single-word
// regeneration after a FAIL verdict) — extracted so neither script
// reimplements PCM->WAV framing or the synthesis HTTP call. Narrator voice,
// distinct from Tamamizu (the mascot's voice) — see
// generateAudioElevenLabs.ts's header for the full history.
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const VOICE_ID = 'LX07LNNrSwlByKloPCtW'
export const MODEL_ID = 'eleven_v3'
export const SAMPLE_RATE = 24000
export const OUT_DIR = path.resolve(import.meta.dirname, '../public/audio')

export function requireApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.error('Set ELEVENLABS_API_KEY first.')
    process.exit(1)
  }
  return apiKey
}

export function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE, numChannels = 1, bitsPerSample = 16): Buffer {
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

export async function synthesize(text: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=pcm_${SAMPLE_RATE}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  })
  if (!res.ok) throw new Error(`synthesis failed (${res.status}) for "${text}": ${await res.text()}`)
  const pcm = Buffer.from(await res.arrayBuffer())
  return pcmToWav(pcm)
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

// Always overwrites — the skip-if-exists decision belongs to the caller
// (generateAudioElevenLabs.ts's bulk loop skips; checkVoiceQuality.ts's
// --regenerate path deliberately wants to overwrite a bad clip).
export async function synthesizeToFile(outPath: string, text: string, apiKey: string): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true })
  const wav = await synthesize(text, apiKey)
  await writeFile(outPath, wav)
}
