// scripts/asr.ts
// Runs local Japanese ASR (whisper.cpp, via a binding that ships
// precompiled Windows binaries so no local build toolchain is needed) on a
// generated word clip, then normalizes whisper's output — which can mix
// kanji, katakana, and hiragana depending on what it "guesses" the word is
// — to hiragana via kuroshiro, so it can be compared mora-by-mora against a
// word's pure-kana `kana` field (src/lib/voiceQuality.ts does that
// comparison; this file only produces the hiragana string to feed it).
import path from 'node:path'
import { whisper } from '@lumen-labs-dev/whisper-node'
import KuroshiroPkg from 'kuroshiro'
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji'

// On Windows, @lumen-labs-dev/whisper-node's internal shelljs pushd DOES
// correctly cd into its bundled whisper.cpp binary directory before
// spawning whisper-cli.exe (verified directly), but it invokes the bare
// command name (no "./" prefix) via shelljs.exec -> cmd.exe. cmd.exe's
// implicit "also search the current directory" behavior can be disabled by
// a system-level security setting (NoDefaultCurrentDirectoryInExePath) --
// when that's set, the binary isn't found even though it exists in cwd.
// Prepending its directory to PATH sidesteps this regardless of that
// setting -- verified this makes whisper-cli.exe resolve correctly; without
// it, on a machine with that setting enabled, every call fails with
// "'whisper-cli.exe' is not recognized as an internal or external command".
if (process.platform === 'win32') {
  const winBinDir = path.resolve(import.meta.dirname, '../node_modules/@lumen-labs-dev/whisper-node/lib/whisper.cpp/Win64')
  if (!process.env.PATH?.includes(winBinDir)) {
    process.env.PATH = `${process.env.PATH};${winBinDir}`
  }
}

// kuroshiro's CJS build nests its class under a second `.default` — unwrap
// defensively (falls back to the top-level export if a future toolchain
// resolves the import without the extra nesting).
const Kuroshiro = (KuroshiroPkg as unknown as { default?: typeof KuroshiroPkg }).default ?? KuroshiroPkg

let kuroshiroInstance: InstanceType<typeof Kuroshiro> | undefined

async function getKuroshiro(): Promise<InstanceType<typeof Kuroshiro>> {
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
