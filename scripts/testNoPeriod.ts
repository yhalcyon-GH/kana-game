import { mkdir, writeFile } from 'node:fs/promises'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

const OUT_DIR = 'C:/Users/halcy/AppData/Local/Temp/azure-test'
const VOICE = 'ja-JP-NanamiNeural'

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
  const key = process.env.AZURE_SPEECH_KEY!
  const region = process.env.AZURE_SPEECH_REGION!
  await mkdir(OUT_DIR, { recursive: true })

  const variants: [string, string][] = [
    ['pan-noperiod', 'パン'],
    ['pan-comma', 'パン、'],
    ['kyanpu-noperiod', 'キャンプ'],
    ['kyanpu-comma', 'キャンプ、'],
  ]

  for (const [label, text] of variants) {
    const buf = await synthesizeSSML(wrapSSML(text), key, region)
    const outPath = `${OUT_DIR}/${label}.wav`
    await writeFile(outPath, buf)
    console.log(`  ${label}: -> ${outPath}`)
  }
}

main()
