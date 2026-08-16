// One-off: does the enclosed text of <phoneme> (kana vs kanji) change the
// resulting prosody, even though ph= fully specifies the pronunciation?
// Testing whether giving Azure's neural voice the kanji "赤" instead of
// "あか" as the phoneme's fallback/context text improves intonation while
// ph= still pins the reading+accent via SAPI notation.
import { mkdir, writeFile } from 'node:fs/promises'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

const OUT_DIR = 'C:/Users/halcy/AppData/Local/Temp/azure-test'
const VOICE = 'ja-JP-NanamiNeural'
const PH = "'アカ" // あか, HL accent, per testAccentSSML.ts's ka-aka result

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

async function main() {
  const key = process.env.AZURE_SPEECH_KEY!
  const region = process.env.AZURE_SPEECH_REGION!
  await mkdir(OUT_DIR, { recursive: true })

  for (const [label, text] of [
    ['kana', 'あか'],
    ['kanji', '赤'],
  ] as const) {
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP">
  <voice name="${VOICE}">
    <phoneme alphabet="sapi" ph="${PH}">${text}</phoneme>。
  </voice>
</speak>`
    const buf = await synthesizeSSML(ssml, key, region)
    const outPath = `${OUT_DIR}/ka-aka-phoneme-${label}.wav`
    await writeFile(outPath, buf)
    console.log(`  ${label} ("${text}"): -> ${outPath}`)
  }
}

main()
