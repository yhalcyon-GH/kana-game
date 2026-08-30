// Generates the Review Guide clip into design/ first, then copies the exact
// master bytes to public/ for runtime playback.
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_REVIEW_GUIDE_LOCALE, REVIEW_GUIDE_CONTENT } from '../src/data/reviewGuideContent'
import { fileExists, requireApiKey, synthesize } from './elevenLabsClient'

const TAMAMIZU_VOICE_ID = 'L7lwGdJEpZzBrRbKVqzV'
const content = REVIEW_GUIDE_CONTENT[DEFAULT_REVIEW_GUIDE_LOCALE]
const masterPath = path.resolve(import.meta.dirname, '../design/audio/guide/review-guide.wav')
const publicPath = path.resolve(import.meta.dirname, '../public/audio/guide/review-guide.wav')

async function main() {
  const regenerate = process.argv.includes('--regenerate')
  if (regenerate || !(await fileExists(masterPath))) {
    const wav = await synthesize(content.speechText, requireApiKey(), TAMAMIZU_VOICE_ID)
    await mkdir(path.dirname(masterPath), { recursive: true })
    await writeFile(masterPath, wav)
  }
  await mkdir(path.dirname(publicPath), { recursive: true })
  await copyFile(masterPath, publicPath)
}

main()
