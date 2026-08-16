import { mkdir, writeFile } from 'node:fs/promises'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

async function main() {
  const key = process.env.AZURE_SPEECH_KEY!
  const region = process.env.AZURE_SPEECH_REGION!
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, undefined as unknown as sdk.AudioConfig)
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP"><voice name="ja-JP-NanamiNeural"><phoneme alphabet="x-microsoft-jpn" ph="a'ka">あか</phoneme></voice></speak>`
  await mkdir('C:/Users/halcy/AppData/Local/Temp/azure-test', { recursive: true })
  synthesizer.speakSsmlAsync(
    ssml,
    (result) => {
      synthesizer.close()
      console.log(result.reason, result.errorDetails)
      if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
        writeFile('C:/Users/halcy/AppData/Local/Temp/azure-test/ssml-phoneme.wav', Buffer.from(result.audioData))
      }
    },
    (err) => {
      synthesizer.close()
      console.error(err)
    },
  )
}
main()
