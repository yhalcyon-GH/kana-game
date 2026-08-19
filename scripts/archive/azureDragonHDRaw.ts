// Like azureDragonHD.ts but takes explicit (wordId, text) pairs and sends
// ONLY that bare text — no trailing "。", no SAPI phoneme wrapping, no
// audioText fallback. For isolating whether the extra scaffolding
// (punctuation/phoneme) was itself part of an intonation problem.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

const VOICE = 'ja-JP-Nanami:DragonHDLatestNeural'
const OUT_DIR = path.resolve(import.meta.dirname, '../../public/audio')

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

const PAIRS: [string, string][] = [
  ['ma-tamago', 'たまご'],
  ['ra-sora', 'そら'],
  ['wa-nihon', '日本'],
  ['ya-okonomiyaki', 'お好み焼き'],
]

async function main() {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) {
    console.error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION first.')
    process.exit(1)
  }
  for (const [id, text] of PAIRS) {
    const buf = await synthesizeSSML(wrapSSML(text), key, region)
    const outPath = path.join(OUT_DIR, 'words', `${id}.wav`)
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, buf)
    console.log(`  words/${id}.wav  ("${text}") [DragonHD, raw]`)
  }
}

main()
