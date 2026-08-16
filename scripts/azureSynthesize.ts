// Azure Neural TTS synthesis — a candidate REPLACEMENT provider for
// character/word audio, tried after ElevenLabs v3 proved unreliable on
// short isolated words (clipped final morae, occasional wrong-reading
// takes even from kana-only input, no direct pitch-accent control).
// Azure Neural voices are generally more stable for short/isolated TTS,
// and Azure SSML supports <phoneme alphabet="x-jaJP"> for explicit
// pitch-accent control (not used yet in this first pass — plain text
// first, see if it's even needed).
//
//   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... npx tsx scripts/azureSynthesize.ts <outPath> <text> [voice]
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

const DEFAULT_VOICE = 'ja-JP-NanamiNeural'

export function synthesizeAzure(text: string, key: string, region: string, voice: string = DEFAULT_VOICE): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
    speechConfig.speechSynthesisVoiceName = voice
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, undefined as unknown as sdk.AudioConfig)
    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close()
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve(Buffer.from(result.audioData))
        } else {
          reject(new Error(`Azure synthesis failed: ${result.errorDetails}`))
        }
      },
      (err) => {
        synthesizer.close()
        reject(new Error(String(err)))
      },
    )
  })
}

async function main() {
  const [outPath, text, voice] = process.argv.slice(2)
  if (!outPath || !text) {
    console.error('Usage: azureSynthesize.ts <outPath> <text> [voice]')
    process.exit(1)
  }
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) {
    console.error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION first.')
    process.exit(1)
  }
  const buf = await synthesizeAzure(text, key, region, voice)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, buf)
  console.log(`wrote ${outPath} (voice=${voice ?? DEFAULT_VOICE})`)
}

main()
