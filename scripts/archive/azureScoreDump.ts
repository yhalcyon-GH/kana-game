import path from 'node:path'
import { WORDS_BY_ROW } from '../src/data/words'
import { assessPronunciation, requireAzureCredentials } from './azurePronunciation'
import { OUT_DIR } from './elevenLabsClient'

async function main() {
  const rows = process.argv.slice(2)
  const { key, region } = requireAzureCredentials()
  for (const row of rows) {
    const words = WORDS_BY_ROW[row] ?? []
    for (const w of words) {
      const wavPath = path.join(OUT_DIR, 'words', `${w.id}.wav`)
      const r = await assessPronunciation(wavPath, w.kana, key, region)
      console.log(`${w.id}\tacc=${r.accuracyScore}\tflu=${r.fluencyScore}\tpron=${r.pronScore.toFixed(1)}\trecognized="${r.recognizedText}"`)
    }
  }
}
main()
