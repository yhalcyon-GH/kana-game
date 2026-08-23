// One-off generator for Tamamizu Guide Phase 1's narration (Issue #29's
// missing-asset follow-up) — public/audio/guide/intro-*.wav. Distinct voice
// from scripts/generateAudioElevenLabs.ts's narrator: this uses the voice
// the user specified for this recording (passed via --voice, see below),
// not scripts/elevenLabsClient.ts's default VOICE_ID.
//
// Text here is the EXACT wording src/data/introGuideContent.ts's `subtitle`
// fields use (captions and audio must match) — this script doesn't read
// that file to avoid coupling a one-off script to app source; keep both in
// sync by hand if either changes.
//
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateGuideAudio.ts --voice <voiceId>
import path from 'node:path'
import { OUT_DIR, requireApiKey, synthesizeToFile } from './elevenLabsClient'

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
    id: 'intro-kanji-meaning',
    text: 'Kanji also carry meaning. The top kanji means "mountain," and the bottom one means "tree."',
  },
  { id: 'intro-start-hiragana', text: "In this app, you'll learn Hiragana and Katakana. Let's start with Hiragana!" },
]

async function main() {
  for (const step of STEPS) {
    const outPath = path.join(OUT_DIR, 'guide', `${step.id}.wav`)
    console.log(`Generating ${step.id}.wav ...`)
    await synthesizeToFile(outPath, step.text, apiKey, voiceId)
    console.log(`  -> ${outPath}`)
  }
}

main()
