// Same approach as azureRegenerateHiragana.ts, applied to every row NOT
// already covered by it: katakana, sokuon, chōon, and yōon (both hiragana
// and katakana yōon rows). See that script's header for the full
// rationale (Azure Neural TTS S0, SSML <phoneme alphabet="sapi"> combining
// kanji/audioText for natural prosody with accent-marked katakana for
// exact reading).
//
// Accent data (accents.ts) does not cover yōon words at all (buildAccentData.mjs
// deliberately guards against the mora/glyph-count mismatch — see CLAUDE.md's
// "one kana glyph = one mora, EXCEPT yōon" note) and is missing for many
// katakana/sokuon/chōon words too (dataset gaps). Words without accent data
// fall back to plain text (kanji audioText if present, else kana) with no
// phoneme override — same fallback azureRegenerateHiragana.ts uses for its
// one uncovered word.
//
//   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... npx tsx scripts/azureRegenerateRemaining.ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { CHARACTERS } from '../../src/data/characters'
import { ACCENT_PATTERNS } from '../../src/data/accents'
import { ROWS } from '../../src/data/curriculum'
import { WORDS_BY_ROW } from '../../src/data/words'

const VOICE = 'ja-JP-NanamiNeural'
const OUT_DIR = path.resolve(import.meta.dirname, '../../public/audio')
const HIRAGANA_ROWS = new Set(['a-row', 'ka-row', 'sa-row', 'ta-row', 'na-row', 'ha-row', 'ma-row', 'ya-row', 'ra-row', 'wa-row'])
const REMAINING_ROW_IDS = ROWS.filter((r) => !HIRAGANA_ROWS.has(r.id)).map((r) => r.id)

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
    // お行長音には「おう」表記と、歴史的仮名遣いの例外で「おお」表記
    // (とおい・こおり・おおきい 等)の両方があるので、どちらも伸ばす。
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

  const chars = CHARACTERS.filter((c) => REMAINING_ROW_IDS.includes(c.rowId))
  for (const c of chars) {
    const buf = await synthesizeSSML(wrapSSML(`${c.kana}。`), key, region)
    const outPath = path.join(OUT_DIR, 'characters', `${c.id}.wav`)
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, buf)
    console.log(`  characters/${c.id}.wav  ("${c.kana}")`)
  }

  for (const rowId of REMAINING_ROW_IDS) {
    const words = WORDS_BY_ROW[rowId] ?? []
    for (const w of words) {
      const displayText = w.audioText ?? w.kana
      const accent = ACCENT_PATTERNS[w.id]
      const phoneme = buildPhoneme(w.kana, accent)
      const inner = `<phoneme alphabet="sapi" ph="${phoneme}">${displayText}</phoneme>。`
      const buf = await synthesizeSSML(wrapSSML(inner), key, region)
      const outPath = path.join(OUT_DIR, 'words', `${w.id}.wav`)
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, buf)
      console.log(`  words/${w.id}.wav  ("${displayText}" ph="${phoneme}"${accent ? '' : ' [no accent nucleus]'})`)
    }
  }

  console.log('Done.')
}

main()
