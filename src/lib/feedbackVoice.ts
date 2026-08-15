import {
  DONMAI,
  type FeedbackLine,
  IINE,
  INCORRECT_LINES,
  KAKKOII,
  KAKKOII_CHANCE,
  KANPEKI,
  NEAR_MISS_ONLY_ID,
  OSHII,
  SAIKOU,
  SEIKAI,
  SUGOI,
} from '../data/feedback'

export type FeedbackClip = { id: string; text: string }

function pickOne<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)]
}

function clipFor(line: FeedbackLine): FeedbackClip {
  return { id: line.id, text: line.text }
}

// Picks the line for a correct answer at the given (1-indexed) consecutive-
// correct streak count: 5-in-a-row says さいこう, with a rare かっこいい
// alternate; 3-in-a-row says すごい; every other correct answer says せいかい.
export function pickCorrectFeedback(streak: number): FeedbackClip {
  if (streak === 5) return clipFor(Math.random() < KAKKOII_CHANCE ? KAKKOII : SAIKOU)
  if (streak === 3) return clipFor(SUGOI)
  return clipFor(SEIKAI)
}

// `isNearMiss` gates おしい — it's only fair to say "so close!" when the
// wrong answer really was one character/dakuten off (see
// lib/answerCloseness.ts). Every other incorrect line is always eligible.
export function pickIncorrectFeedback(isNearMiss: boolean): FeedbackClip {
  const pool = isNearMiss ? INCORRECT_LINES : INCORRECT_LINES.filter((l) => l.id !== NEAR_MISS_ONLY_ID)
  return clipFor(pickOne(pool))
}

// Played once at session end: かんぺき for a flawless run, おしい for
// exactly 1 missed, いいね for exactly 2 missed, ドンマイ for 3 or more.
// The first three are the "bright" tiers (see Mascot's mood mapping in
// useAnswerFeedback.ts); ドンマイ alone gets the gentler, comforting tone.
export function pickEvaluationFeedback(mistakeCount: number): FeedbackClip {
  if (mistakeCount === 0) return clipFor(KANPEKI)
  if (mistakeCount === 1) return clipFor(OSHII)
  if (mistakeCount === 2) return clipFor(IINE)
  return clipFor(DONMAI)
}
