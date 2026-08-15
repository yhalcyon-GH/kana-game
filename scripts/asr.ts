// scripts/asr.ts
// Runs local Japanese ASR (whisper.cpp, via a binding that ships
// precompiled Windows binaries so no local build toolchain is needed) on a
// generated word clip, then normalizes whisper's output — which can mix
// kanji, katakana, and hiragana depending on what it "guesses" the word is
// — to hiragana via kuroshiro, so it can be compared mora-by-mora against a
// word's pure-kana `kana` field (src/lib/voiceQuality.ts does that
// comparison; this file only produces the hiragana string to feed it).
import { whisper } from '@lumen-labs-dev/whisper-node'
import Kuroshiro from 'kuroshiro'
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji'

let kuroshiroInstance: Kuroshiro | undefined

async function getKuroshiro(): Promise<Kuroshiro> {
  if (!kuroshiroInstance) {
    kuroshiroInstance = new Kuroshiro()
    await kuroshiroInstance.init(new KuromojiAnalyzer())
  }
  return kuroshiroInstance
}

export async function transcribeToHiragana(wavPath: string, modelName: string): Promise<string> {
  const segments = await whisper(wavPath, {
    modelName,
    whisperOptions: { language: 'ja' },
  })
  const rawText = segments
    .map((segment: { speech: string }) => segment.speech)
    .join('')
    .trim()
  if (!rawText) return ''
  const kuroshiro = await getKuroshiro()
  const hiragana: string = await kuroshiro.convert(rawText, { to: 'hiragana', mode: 'normal' })
  return hiragana
}
