// Pre-generates every character and word pronunciation clip (public/audio/
// characters/<id>.wav, public/audio/words/<id>.wav) with a dedicated
// ElevenLabs narrator voice — distinct from Tamamizu (the mascot's voice,
// used only for in-game feedback lines; see scripts/generateFeedbackAudio
// -related history and project_kana_game_elevenlabs_voice memory). This
// voice was chosen specifically for clear, well-enunciated pronunciation
// since that's what a kana-learning app actually needs, and replaces both
// the previous COEIROINK word audio and the real-human character
// recordings.
//
// Text sent to the API is `word.audioText ?? word.kana` for words (see
// src/data/words.ts's audioText comment for why bare kana is often the
// wrong input) and the bare kana character for single kana.
//
// SKIPS any id that already has a clip on disk (same safety convention as
// scripts/generateFeedbackAudio.ts) — re-running this after adding new
// content only pays for what's actually new/missing, never re-charges for
// clips that already exist. Delete a specific .wav first if you deliberately
// want to regenerate just that one (or use `npm run check-voices --
// --regenerate --yes`, which does this for FAILed clips automatically).
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateAudioElevenLabs.ts
import path from 'node:path'
import { CHARACTERS } from '../src/data/characters'
import { ALL_WORDS } from '../src/data/words'
import { fileExists, OUT_DIR, requireApiKey, synthesizeToFile } from './elevenLabsClient'

const apiKey = requireApiKey()

async function generateAll(subdir: string, items: { id: string; text: string }[]) {
  const dir = path.join(OUT_DIR, subdir)
  for (const { id, text } of items) {
    const outPath = path.join(dir, `${id}.wav`)
    if (await fileExists(outPath)) {
      console.log(`  skip ${subdir}/${id}.wav (already exists)`)
      continue
    }
    await synthesizeToFile(outPath, text, apiKey)
    console.log(`  wrote ${subdir}/${id}.wav  ("${text}")`)
  }
}

async function main() {
  console.log(`Generating ${CHARACTERS.length} character clips...`)
  await generateAll(
    'characters',
    CHARACTERS.map((c) => ({ id: c.id, text: c.kana })),
  )

  console.log(`Generating ${ALL_WORDS.length} word clips...`)
  await generateAll(
    'words',
    ALL_WORDS.map((w) => ({ id: w.id, text: w.audioText ?? w.kana })),
  )

  console.log('Done.')
}

main()
