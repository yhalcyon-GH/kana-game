// One-off: build Azure SSML with explicit pitch-accent (x-microsoft-jpn
// phoneme alphabet) from this app's own accent dataset (src/data/accents.ts,
// sourced from accentjiten.com — never hand-guessed, see CLAUDE.md), and
// synthesize a few test words to see whether it fixes the wrong-intonation
// problem plain-text Azure TTS had on isolated short words (e.g. あか).
//
// ja-JP's SAPI phonetic alphabet (alphabet="sapi") writes the word in
// KATAKANA and marks the accent nucleus with an apostrophe placed
// IMMEDIATELY BEFORE the accented mora — e.g. 合成 (ゴウセイ, accent on
// mora 2) is written "ゴ'ウセイ". Verified against Azure's own
// speech-ssml-phonetic-sets ja-JP doc (not guessed — an earlier attempt
// using a nonexistent "x-microsoft-jpn" alphabet with romaji+trailing-
// apostrophe failed SSML parsing entirely). A word with no pitch drop
// (heiban) gets no apostrophe.
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { ACCENT_PATTERNS } from '../src/data/accents'
import { WORDS_BY_ROW } from '../src/data/words'

const OUT_DIR = 'C:/Users/halcy/AppData/Local/Temp/azure-test'
const VOICE = 'ja-JP-NanamiNeural'

function toKatakana(text: string): string {
  return text.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
}

function toMorae(kana: string): string[] {
  const SMALL = new Set(['ゃ', 'ゅ', 'ょ', 'ゎ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ'])
  const morae: string[] = []
  for (const ch of kana) {
    if (SMALL.has(ch) && morae.length > 0) morae[morae.length - 1] += ch
    else morae.push(ch)
  }
  return morae
}

function buildPhoneme(kana: string, accent: string): string {
  const morae = toMorae(kana)
  if (morae.length !== accent.length) {
    throw new Error(`mora/accent length mismatch for "${kana}" (${morae.length} morae vs accent "${accent}")`)
  }
  const katakanaMorae = morae.map((m) => toKatakana(m))
  // え行長音: えい written as two morae but pronounced as one extended e
  // (てーねー, not てーいーねーいー) — see CLAUDE.md's chōon per-vowel-
  // column spelling rules. Collapse a raw い mora into ー when it directly
  // follows an e-column mora.
  const E_COLUMN = new Set(['エ', 'ケ', 'ゲ', 'セ', 'ゼ', 'テ', 'デ', 'ネ', 'ヘ', 'ベ', 'ペ', 'メ', 'レ'])
  for (let i = 1; i < katakanaMorae.length; i++) {
    if (katakanaMorae[i] === 'イ' && E_COLUMN.has(katakanaMorae[i - 1])) {
      katakanaMorae[i] = 'ー'
    }
  }
  let nucleusIndex = -1
  for (let i = 0; i < accent.length - 1; i++) {
    if (accent[i] === 'H' && accent[i + 1] === 'L') {
      nucleusIndex = i
      break
    }
  }
  if (nucleusIndex === -1) return katakanaMorae.join('')
  return katakanaMorae.slice(0, nucleusIndex).join('') + "'" + katakanaMorae.slice(nucleusIndex).join('')
}

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
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) {
    console.error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION first.')
    process.exit(1)
  }

  const wordIds = process.argv.slice(2)
  const allWords = Object.values(WORDS_BY_ROW).flat()
  await mkdir(OUT_DIR, { recursive: true })

  for (const id of wordIds) {
    const word = allWords.find((w) => w.id === id)
    if (!word) {
      console.error(`Unknown word id "${id}"`)
      continue
    }
    const accent = ACCENT_PATTERNS[id]
    if (!accent) {
      console.error(`No accent data for "${id}" (${word.kana}) — skipping`)
      continue
    }
    let phoneme: string
    try {
      phoneme = buildPhoneme(word.kana, accent)
    } catch (err) {
      console.error(`  ${id}: ${(err as Error).message}`)
      continue
    }
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP">
  <voice name="${VOICE}">
    <phoneme alphabet="sapi" ph="${phoneme}">${word.kana}</phoneme>。
  </voice>
</speak>`
    const buf = await synthesizeSSML(ssml, key, region)
    const outPath = path.join(OUT_DIR, `${id}-ssml.wav`)
    await writeFile(outPath, buf)
    console.log(`  ${id}: kana="${word.kana}" accent="${accent}" phoneme="${phoneme}" -> ${outPath}`)
  }
}

main()
