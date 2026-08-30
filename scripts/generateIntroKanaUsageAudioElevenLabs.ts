// Generates only the Introduction kana-usage narration, keeping the paid
// request isolated from the five existing Introduction clips. The locale
// content is the single source of truth, so subtitle and narration stay exact.
//
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateIntroKanaUsageAudioElevenLabs.ts
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateIntroKanaUsageAudioElevenLabs.ts --regenerate
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from '../src/data/introGuideContent'
import { fileExists, requireApiKey, synthesize } from './elevenLabsClient'

const TAMAMIZU_VOICE_ID = 'L7lwGdJEpZzBrRbKVqzV'
const content = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE].steps['intro.kanaUsage']
const masterPath = path.resolve(import.meta.dirname, '../design/audio/guide/intro-kana-usage.wav')
const publicPath = path.resolve(import.meta.dirname, '../public/audio/guide/intro-kana-usage.wav')

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
