// Regenerate ALL hiragana character + word audio with Azure Neural TTS
// (ja-JP-NanamiNeural, S0 paid tier — required for commercial output use
// rights, see Product Terms), replacing the ElevenLabs v3 clips that were
// proving unreliable (clipped final morae, occasional wrong-reading takes,
// no real pitch-accent control).
//
// Words are synthesized via SSML <phoneme alphabet="sapi" ph="...">,
// which lets us pass BOTH the natural orthography (kanji, for Azure's
// prosody model to read off — proven to fix wrong intonation, e.g. 赤)
// AND the exact correct reading + pitch accent (SAPI katakana notation
// with an accent-nucleus apostrophe, built from this app's own
// accents.ts, itself sourced from accentjiten.com — never hand-guessed).
// This avoids the earlier failure mode where plain kanji sometimes
// resolved to the wrong reading (日本 -> にっぽん instead of にほん).
//
//   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... npx tsx scripts/azureRegenerateHiragana.ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { CHARACTERS } from '../../src/data/characters'
import { ACCENT_PATTERNS } from '../../src/data/accents'
import { WORDS_BY_ROW } from '../../src/data/words'

const VOICE = 'ja-JP-NanamiNeural'
const OUT_DIR = path.resolve(import.meta.dirname, '../../public/audio')
const ROWS = ['a-row', 'ka-row', 'sa-row', 'ta-row', 'na-row', 'ha-row', 'ma-row', 'ya-row', 'ra-row', 'wa-row']

function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
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

// え行長音(えい->ee)・お行長音(おう->oo) は書き文字上は2モーラだが実際は
// 1つの伸ばした母音として発音される — SAPI表記でも素直に書くと「テ・イ」
// のように区切って読まれてしまうため、伸ばす方の文字をー(長音符)に
// 置き換える。CLAUDE.mdのchōon母音列ルール参照。
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

  // Characters: single mora, no accent contrast to encode — plain reading.
  const chars = CHARACTERS.filter((c) => ROWS.includes(c.rowId))
  for (const c of chars) {
    const ssml = wrapSSML(`${c.kana}。`)
    const buf = await synthesizeSSML(ssml, key, region)
    const outPath = path.join(OUT_DIR, 'characters', `${c.id}.wav`)
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, buf)
    console.log(`  characters/${c.id}.wav  ("${c.kana}")`)
  }

  // Words: kanji (audioText) for natural prosody + SAPI phoneme for exact
  // reading/accent, when accent data exists; otherwise plain fallback.
  for (const row of ROWS) {
    const words = WORDS_BY_ROW[row] ?? []
    for (const w of words) {
      const displayText = w.audioText ?? w.kana
      const accent = ACCENT_PATTERNS[w.id]
      const phoneme = buildPhoneme(w.kana, accent)
      const inner = `<phoneme alphabet="sapi" ph="${phoneme}">${displayText}</phoneme>。`
      const buf = await synthesizeSSML(wrapSSML(inner), key, region)
      const outPath = path.join(OUT_DIR, 'words', `${w.id}.wav`)
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, buf)
      console.log(`  words/${w.id}.wav  ("${displayText}", ph="${phoneme}"${accent ? '' : ' [no accent nucleus]'})`)
    }
  }

  console.log('Done.')
}

main()
