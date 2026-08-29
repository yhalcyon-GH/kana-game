// Generates the three Special Katakana Guide narration clips. The locale
// content is the single source of truth so each step's subtitle and
// narration stay exact — this script just synthesizes exactly that text per
// audioKey, one clip per step. Modeled directly on
// generateYouonGuideAudioElevenLabs.ts.
//
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateSpecialKatakanaGuideAudioElevenLabs.ts
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateSpecialKatakanaGuideAudioElevenLabs.ts --regenerate
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_SPECIAL_KATAKANA_GUIDE_LOCALE,
  SPECIAL_KATAKANA_GUIDE_CONTENT,
} from '../src/data/specialKatakanaGuideContent'
import { fileExists, requireApiKey, synthesize } from './elevenLabsClient'

const TAMAMIZU_VOICE_ID = 'L7lwGdJEpZzBrRbKVqzV'
const content = SPECIAL_KATAKANA_GUIDE_CONTENT[DEFAULT_SPECIAL_KATAKANA_GUIDE_LOCALE]

async function main() {
  const regenerate = process.argv.includes('--regenerate')
  const apiKey = requireApiKey()

  for (const step of Object.values(content.steps)) {
    // audioKey is e.g. 'guide/special-katakana-intro' -> file basename
    // 'special-katakana-intro.wav'.
    const basename = `${path.basename(step.audioKey)}.wav`
    const masterPath = path.resolve(import.meta.dirname, '../design/audio/guide', basename)
    const publicPath = path.resolve(import.meta.dirname, '../public/audio/guide', basename)

    if (regenerate || !(await fileExists(masterPath))) {
      const wav = await synthesize(step.subtitle, apiKey, TAMAMIZU_VOICE_ID)
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
}

main()
