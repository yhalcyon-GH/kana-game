// Like variantTest.ts, but generates N independent takes of the SAME text
// (v3 has run-to-run variance) so a human can pick the best-sounding one,
// and reports Azure's reading-match check for each (to catch a take that
// slipped into the wrong reading, e.g. 日本 -> にっぽん).
import path from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { WORDS_BY_ROW } from '../src/data/words'
import { requireApiKey, synthesize } from './elevenLabsClient'
import { assessPronunciation, requireAzureCredentials } from './azurePronunciation'

const VOICE_ID = 'fWZkPh6JTVXYK2vuJIbv'

async function main() {
  const [wordId, text, takesArg] = process.argv.slice(2)
  const takes = Number(takesArg ?? '4')
  if (!wordId || !text) {
    console.error('Usage: variantTest2.ts <wordId> <text> [takes=4]')
    process.exit(1)
  }
  const allWords = Object.values(WORDS_BY_ROW).flat()
  const word = allWords.find((w) => w.id === wordId)
  if (!word) {
    console.error(`Unknown word id "${wordId}"`)
    process.exit(1)
  }

  const apiKey = requireApiKey()
  const { key, region } = requireAzureCredentials()
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'variant-test2-'))
  console.log(`Word: ${wordId}  text="${text}"  correct reading: ${word.kana}  (${tmpDir})\n`)

  for (let i = 0; i < takes; i++) {
    const wav = await synthesize(text, apiKey, VOICE_ID)
    const outPath = path.join(tmpDir, `take${i}.wav`)
    writeFileSync(outPath, wav)
    const result = await assessPronunciation(outPath, word.kana, key, region)
    console.log(`  take${i}: recognized="${result.recognizedText}" acc=${result.accuracyScore} flu=${result.fluencyScore} -> ${outPath}`)
  }
}

main()
