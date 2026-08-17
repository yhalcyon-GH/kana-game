// One-off: regenerate a hardcoded set of word clips that both Whisper and
// Azure flagged as bad on the first candidate-voice pass, after removing
// their kanji audioText overrides (which were causing wrong-reading
// mispronunciations, e.g. sa-kazu's '数' -> すう instead of かず).
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/regenerateFlaggedWords.ts
import path from 'node:path'
import { WORDS_BY_ROW } from '../src/data/words'
import { OUT_DIR, requireApiKey, synthesizeToFile } from './elevenLabsClient'

const VOICE_ID = 'fWZkPh6JTVXYK2vuJIbv'

const WORD_IDS = [
  'a-ue',
  'sa-kazu',
  'sa-sake',
  'ta-tako',
  'na-nani',
  'ma-mimi',
  'ya-yuki',
  'wa-watashi',
  'wa-nihon',
  'sokuon-kako',
  'chouon-e-yuumei',
  'chouon-o-otouto',
  'youon-cha-na-chou',
  'youon-ma-ra-bimyou',
  'youon-ma-ra-ryokan',
]

async function main() {
  const apiKey = requireApiKey()
  const allWords = Object.values(WORDS_BY_ROW).flat()

  for (const id of WORD_IDS) {
    const word = allWords.find((w) => w.id === id)
    if (!word) {
      console.error(`Unknown word id "${id}"`)
      continue
    }
    const text = word.audioText ?? word.kana
    const outPath = path.join(OUT_DIR, 'words', `${word.id}.wav`)
    await synthesizeToFile(outPath, text, apiKey, VOICE_ID)
    console.log(`  wrote words/${word.id}.wav  ("${text}")`)
  }

  console.log('Done.')
}

main()
