// One-off: for a given word id, synthesize several TEXT VARIANTS of its
// reading (plain kana / katakana / kana+"。") with the candidate voice,
// score each with Azure Pronunciation Assessment against the correct kana
// reading, and print a comparison table WITHOUT overwriting the real clip.
// Lets a human pick the best-scoring variant before committing it.
//
//   ELEVENLABS_API_KEY=... AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... \
//     npx tsx scripts/variantTest.ts <wordId> <variant1> [variant2] [variant3] ...
import path from 'node:path'
import { WORDS_BY_ROW } from '../src/data/words'
import { requireApiKey, synthesize } from './elevenLabsClient'
import { assessPronunciation, requireAzureCredentials } from './azurePronunciation'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const VOICE_ID = 'fWZkPh6JTVXYK2vuJIbv'

async function main() {
  const [wordId, ...variants] = process.argv.slice(2)
  if (!wordId || variants.length === 0) {
    console.error('Usage: variantTest.ts <wordId> <variant1> [variant2] ...')
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
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'variant-test-'))

  console.log(`Word: ${wordId}  correct reading: ${word.kana}\n`)

  for (const text of variants) {
    const wav = await synthesize(text, apiKey, VOICE_ID)
    const outPath = path.join(tmpDir, `${wordId}-${Buffer.from(text).toString('hex')}.wav`)
    writeFileSync(outPath, wav)
    const result = await assessPronunciation(outPath, word.kana, key, region)
    console.log(
      `  text="${text}"  recognized="${result.recognizedText}"  acc=${result.accuracyScore} flu=${result.fluencyScore} pron=${result.pronScore}  -> ${outPath}`,
    )
  }
}

main()
