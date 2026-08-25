// Generates only the Sokuon Guide narration. The locale content is the
// single source of truth so the subtitle and narration stay exact.
//
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateSokuonGuideAudioElevenLabs.ts
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateSokuonGuideAudioElevenLabs.ts --regenerate
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SOKUON_GUIDE_LOCALE, SOKUON_GUIDE_CONTENT } from '../src/data/sokuonGuideContent'
import { fileExists, requireApiKey, synthesize } from './elevenLabsClient'

const TAMAMIZU_VOICE_ID = 'L7lwGdJEpZzBrRbKVqzV'
const content = SOKUON_GUIDE_CONTENT[DEFAULT_SOKUON_GUIDE_LOCALE]
const masterPath = path.resolve(import.meta.dirname, '../design/audio/guide/sokuon-guide.wav')
const publicPath = path.resolve(import.meta.dirname, '../public/audio/guide/sokuon-guide.wav')

async function main() {
  const regenerate = process.argv.includes('--regenerate')
  if (regenerate || !(await fileExists(masterPath))) {
    const wav = await synthesize(content.subtitle, requireApiKey(), TAMAMIZU_VOICE_ID)
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
