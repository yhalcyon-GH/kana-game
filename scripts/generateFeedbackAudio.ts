// Pre-generates MANA's answer-feedback voice lines (see src/data/feedback.ts
// for the phrase/style catalog and lib/feedbackVoice.ts for how they're
// picked at runtime) so the deployed app can ship static audio files
// instead of depending on a locally-running COEIROINK engine at playback
// time. Run once (whenever src/data/feedback.ts changes) with a local
// COEIROINK v2 engine running on the default port:
//   npx tsx scripts/generateFeedbackAudio.ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  BONUS_LINES,
  CORRECT_PHRASES,
  CORRECT_RARE_STYLE,
  CORRECT_STYLES,
  FEEDBACK_SPEAKER_UUID,
  INCORRECT_PHRASES,
  INCORRECT_RARE_STYLE,
  INCORRECT_STYLES,
  PERFECT_PHRASE,
  STREAK_3_PHRASE,
  STREAK_5_PHRASE,
  type Phrase,
  type StyleOption,
} from '../src/data/feedback'
import { FEEDBACK_PROSODY, FEEDBACK_PROSODY_INTONATION_SCALE } from '../src/data/feedbackProsody'

const COEIROINK_BASE_URL = 'http://localhost:50032'
const OUT_DIR = path.resolve(import.meta.dirname, '../public/audio/feedback')

// phraseKey looks up FEEDBACK_PROSODY — when present, the clip keeps the
// hand-tuned accent/intonation from 正解エフェクト.cink regardless of which
// style variant is being rendered (see feedbackProsody.ts).
async function synthesize(text: string, styleId: number, phraseKey: string): Promise<Buffer> {
  const prosody = FEEDBACK_PROSODY[phraseKey]
  const res = await fetch(`${COEIROINK_BASE_URL}/v1/synthesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      speakerUuid: FEEDBACK_SPEAKER_UUID,
      styleId,
      text,
      ...(prosody ? { prosodyDetail: [prosody] } : {}),
      speedScale: 1.0,
      volumeScale: 1.0,
      pitchScale: 0.0,
      intonationScale: prosody ? FEEDBACK_PROSODY_INTONATION_SCALE : 1.0,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.1,
      outputSamplingRate: 24000,
    }),
  })
  if (!res.ok) throw new Error(`synthesis failed (${res.status}) for "${text}" (style ${styleId}): ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

function cartesian(
  phrases: Phrase[],
  styles: StyleOption[],
): { id: string; text: string; styleId: number; phraseKey: string }[] {
  return phrases.flatMap((phrase) =>
    styles.map((style) => ({
      id: `${phrase.key}-${style.key}`,
      text: phrase.text,
      styleId: style.styleId,
      phraseKey: phrase.key,
    })),
  )
}

async function main() {
  const speakersRes = await fetch(`${COEIROINK_BASE_URL}/v1/speakers`).catch(() => null)
  if (!speakersRes?.ok) {
    console.error('COEIROINK engine is not reachable at ' + COEIROINK_BASE_URL)
    console.error('Start the COEIROINK app first, then re-run this script.')
    process.exit(1)
  }

  const clips = [
    ...cartesian([...CORRECT_PHRASES, STREAK_3_PHRASE, STREAK_5_PHRASE, PERFECT_PHRASE], [
      ...CORRECT_STYLES,
      CORRECT_RARE_STYLE,
    ]),
    ...cartesian(INCORRECT_PHRASES, [...INCORRECT_STYLES, INCORRECT_RARE_STYLE]),
    ...BONUS_LINES.map((b) => ({ id: b.id, text: b.text, styleId: b.styleId, phraseKey: b.id })),
  ]

  console.log(`Generating ${clips.length} feedback clips...`)
  await mkdir(OUT_DIR, { recursive: true })
  for (const { id, text, styleId, phraseKey } of clips) {
    const wav = await synthesize(text, styleId, phraseKey)
    await writeFile(path.join(OUT_DIR, `${id}.wav`), wav)
    console.log(`  ${id}.wav  ("${text}", style ${styleId}${FEEDBACK_PROSODY[phraseKey] ? ', tuned prosody' : ''})`)
  }

  console.log('Done.')
}

main()
