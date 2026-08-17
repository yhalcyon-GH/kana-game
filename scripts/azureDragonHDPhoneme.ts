// DragonHD voice + SAPI accent-nucleus phoneme forcing, combined —
// DragonHD alone got 有名/まあまあ/ピュア right but not everything, and
// plain accent-forcing on the regular voice didn't nail these either;
// try both together for words that resisted each individually.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { ACCENT_PATTERNS } from '../src/data/accents'
import { WORDS_BY_ROW } from '../src/data/words'

const VOICE = 'ja-JP-Nanami:DragonHDLatestNeural'
const OUT_DIR = path.resolve(import.meta.dirname, '../public/audio')

function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
}
function toMorae(kana: string): string[] {
  const SMALL = new Set(['ゃ', 'ゅ', 'ょ', 'ゎ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ャ', 'ュ', 'ョ', 'ヮ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ'])
  const morae: string[] = []
  for (const ch of kana) {
    if (SMALL.has(ch) && morae.length > 0) morae[morae.length - 1] += ch
    else morae.push(ch)
  }
  return morae
}
const E_COLUMN = new Set(['エ', 'ケ', 'ゲ', 'セ', 'ゼ', 'テ', 'デ', 'ネ', 'ヘ', 'ベ', 'ペ', 'メ', 'レ'])
const O_COLUMN = new Set(['オ', 'コ', 'ゴ', 'ソ', 'ゾ', 'ト', 'ド', 'ノ', 'ホ', 'ボ', 'ポ', 'モ', 'ヨ', 'ロ'])
function buildPhoneme(kana: string, accent?: string): string {
  const morae = toMorae(kana)
  if (accent && morae.length !== accent.length) {
    throw new Error(`mora/accent length mismatch for "${kana}" (${morae.length} morae vs accent "${accent}")`)
  }
  const katakanaMorae = morae.map((m) => toKatakana(m))
  for (let i = 1; i < katakanaMorae.length; i++) {
    if (katakanaMorae[i] === 'イ' && E_COLUMN.has(katakanaMorae[i - 1])) katakanaMorae[i] = 'ー'
    if ((katakanaMorae[i] === 'ウ' || katakanaMorae[i] === 'オ') && O_COLUMN.has(katakanaMorae[i - 1])) katakanaMorae[i] = 'ー'
  }
  if (!accent) return katakanaMorae.join('')
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
    const displayText = w.audioText ?? w.kana
    const accent = ACCENT_PATTERNS[w.id]
    const phoneme = buildPhoneme(w.kana, accent)
    const inner = `<phoneme alphabet="sapi" ph="${phoneme}">${displayText}</phoneme>。`
    const buf = await synthesizeSSML(wrapSSML(inner), key, region)
    const outPath = path.join(OUT_DIR, 'words', `${w.id}.wav`)
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, buf)
    console.log(`  words/${w.id}.wav  ("${displayText}" ph="${phoneme}") [DragonHD+phoneme]`)
  }
}

main()
