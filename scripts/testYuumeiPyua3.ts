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
    ['yuumei-doublelong', '<phoneme alphabet="sapi" ph="ユウメーー">有名</phoneme>。'],
    ['yuumei-prosody-slow', '<prosody rate="-20%"><phoneme alphabet="sapi" ph="ユウメー">有名</phoneme></prosody>。'],
    ['pyua-split-phoneme', '<phoneme alphabet="sapi" ph="ピュ">ピュ</phoneme><phoneme alphabet="sapi" ph="ア">ア</phoneme>。'],
    ['pyua-split-plain', 'ピュ<break time="10ms"/>ア。'],
  ]

  for (const [label, inner] of variants) {
    try {
      const buf = await synthesizeSSML(wrapSSML(inner), key, region)
      await writeFile(`${OUT_DIR}/${label}.wav`, buf)
      console.log(`  ${label}`)
    } catch (err) {
      console.error(`  ${label}: FAILED - ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

main()
