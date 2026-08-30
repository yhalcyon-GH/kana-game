// One-off generator for Tamamizu Guide Phase 1's narration (Issue #29's
// missing-asset follow-up). Distinct voice from
// scripts/generateAudioElevenLabs.ts's narrator: this uses the voice the
// user specified for this recording (passed via --voice, see below), not
// scripts/elevenLabsClient.ts's default VOICE_ID.
//
// Writes to BOTH locations the project's asset convention expects (see
// design/README's "design/ = source, public/ = served" split, if present,
// or just this comment): design/audio/guide/ is the source/edit master,
// public/audio/guide/ is the exact same file served by the app at runtime
// (Vite copies public/ verbatim — nothing here needs further processing,
// so both copies are byte-identical). Re-running this script overwrites
// both.
//
// Text here is the EXACT wording src/data/introGuideContent.ts's `subtitle`
// fields use (captions and audio must match) — this script doesn't read
// that file to avoid coupling a one-off script to app source; keep both in
// sync by hand if either changes.
//
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateGuideAudio.ts --voice <voiceId>
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { OUT_DIR, requireApiKey, synthesizeToFile } from './elevenLabsClient'

const DESIGN_SOURCE_DIR = path.resolve(import.meta.dirname, '../design/audio/guide')
const PUBLIC_SERVED_DIR = path.join(OUT_DIR, 'guide')

const apiKey = requireApiKey()

function parseArgs(argv: string[]) {
  const voiceIndex = argv.indexOf('--voice')
  const voiceId = voiceIndex !== -1 ? argv[voiceIndex + 1] : undefined
  if (!voiceId) {
    console.error('Usage: ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateGuideAudio.ts --voice <voiceId>')
    process.exit(1)
  }
  return { voiceId }
}

const { voiceId } = parseArgs(process.argv.slice(2))

const STEPS: { id: string; text: string }[] = [
  { id: 'intro-welcome', text: "Hi! I'm Tamamizu. Let's learn Japanese together!" },
  { id: 'intro-writing-systems', text: 'Japanese has three main writing systems: Hiragana, Katakana, and Kanji.' },
  { id: 'intro-kana-sounds', text: 'Hiragana and Katakana represent sounds. Both of these represent the sound "a."' },
  {
    id: 'intro-kana-usage',
    text: 'Hiragana is mainly used for Japanese words and grammar. Katakana is mainly used for foreign words.',
  },
  {
    id: 'intro-kanji-meaning',
    text: 'Kanji also carry meaning. The top kanji means "mountain," and the bottom one means "tree."',
  },
  { id: 'intro-start-hiragana', text: "In this app, you'll learn Hiragana and Katakana. Let's start with Hiragana!" },
]

async function main() {
  await mkdir(DESIGN_SOURCE_DIR, { recursive: true })
  for (const step of STEPS) {
    const sourcePath = path.join(DESIGN_SOURCE_DIR, `${step.id}.wav`)
    const servedPath = path.join(PUBLIC_SERVED_DIR, `${step.id}.wav`)
    console.log(`Generating ${step.id}.wav ...`)
    await synthesizeToFile(sourcePath, step.text, apiKey, voiceId)
    await mkdir(PUBLIC_SERVED_DIR, { recursive: true })
    await copyFile(sourcePath, servedPath)
    console.log(`  -> ${sourcePath}`)
    console.log(`  -> ${servedPath}`)
  }
}

main()
