// Generates one Tamamizu Guide clip into design/ first, then copies that
// master to public/. This makes a repeat run free when the master exists.
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateGuideAudioElevenLabs.ts
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateGuideAudioElevenLabs.ts --regenerate
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { LEARN_TRACING_GUIDE_CONTENT, DEFAULT_LEARN_TRACING_GUIDE_LOCALE } from '../src/data/learnTracingGuideContent'
import { fileExists, requireApiKey, synthesize } from './elevenLabsClient'

const TAMAMIZU_VOICE_ID = 'L7lwGdJEpZzBrRbKVqzV'
const content = LEARN_TRACING_GUIDE_CONTENT[DEFAULT_LEARN_TRACING_GUIDE_LOCALE]
const masterPath = path.resolve(import.meta.dirname, '../design/audio/guide/learn-tracing.wav')
const publicPath = path.resolve(import.meta.dirname, '../public/audio/guide/learn-tracing.wav')

async function main() {
  const regenerate = process.argv.includes('--regenerate')
  if (regenerate || !(await fileExists(masterPath))) {
    const wav = await synthesize(content.speechText, requireApiKey(), TAMAMIZU_VOICE_ID)
    await mkdir(path.dirname(masterPath), { recursive: true })
    await writeFile(masterPath, wav)
    console.log(`wrote master ${masterPath}`)
  } else {
    console.log(`kept existing master ${masterPath}`)
  }
  await mkdir(path.dirname(publicPath), { recursive: true })
  await copyFile(masterPath, publicPath)
  console.log(`copied runtime clip ${publicPath}`)
}

main()
