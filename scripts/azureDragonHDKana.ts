// DragonHD voice, forced to use the word's bare kana (ignoring any kanji
// audioText) with no trailing punctuation — for isolating whether the
// kanji/period scaffolding was itself hurting these specific words.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { WORDS_BY_ROW } from '../src/data/words'

const VOICE = 'ja-JP-Nanami:DragonHDLatestNeural'
const OUT_DIR = path.resolve(import.meta.dirname, '../public/audio')

function synthesizeSSML(ssml: string, key: string, region: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, undefined as unknown as sdk.AudioConfig)
    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        synthesizer.close()
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) resolve(Buffer.from(result.audioData))
        else reject(new Error(`Azure synthesis failed: ${result.errorDetails}`))
      },
      (err) => {
        synthesizer.close()
        reject(new Error(String(err)))
      },
    )
  })
}
function wrapSSML(inner: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP"><voice name="${VOICE}">${inner}</voice></speak>`
}

async function main() {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) {
    console.error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION first.')
    process.exit(1)
  }
  const ids = process.argv.slice(2)
  const allWords = Object.values(WORDS_BY_ROW).flat()
  for (const id of ids) {
    const w = allWords.find((word) => word.id === id)
    if (!w) {
      console.error(`Unknown word id "${id}"`)
      continue
    }
    const buf = await synthesizeSSML(wrapSSML(w.kana), key, region)
    const outPath = path.join(OUT_DIR, 'words', `${w.id}.wav`)
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, buf)
    console.log(`  words/${w.id}.wav  ("${w.kana}") [DragonHD, bare kana]`)
  }
}

main()
