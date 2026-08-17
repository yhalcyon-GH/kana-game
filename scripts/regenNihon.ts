// One-off: regenerate wa-nihon with a trailing "。" to test whether it stops
// the synthesized clip clipping the final ん (user reported "にほん" being
// heard as "にほ").
import path from 'node:path'
import { OUT_DIR, requireApiKey, synthesizeToFile } from './elevenLabsClient'

const VOICE_ID = 'fWZkPh6JTVXYK2vuJIbv'

async function main() {
  const apiKey = requireApiKey()
  const outPath = path.join(OUT_DIR, 'words', 'wa-nihon.wav')
  await synthesizeToFile(outPath, 'にほん。', apiKey, VOICE_ID)
  console.log(`wrote ${outPath} with text "にほん。"`)
}

main()
