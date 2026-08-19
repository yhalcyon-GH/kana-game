import {
  CORRECT_SONOCHOUSHI,
  EVAL_FAITO,
  type FeedbackLine,
  INCORRECT_LINES,
  KANPEKI,
  NORMAL_CORRECT_LINES,
  type QuestionMode,
  STREAK_MILESTONES,
  SUGOI,
  WRONG_GANBARE,
} from '../data/feedback'

export type FeedbackClip = { id: string; text: string }

function clipFor(line: FeedbackLine): FeedbackClip {
  return { id: line.id, text: line.text }
}

// Picks randomly from `pool`, excluding whatever was picked last time (from
// this same pool) so the same line never plays twice in a row.
function pickWithoutImmediateRepeat(pool: readonly FeedbackLine[], lastId: string | null): FeedbackLine {
  const options = lastId ? pool.filter((l) => l.id !== lastId) : pool
  return options[Math.floor(Math.random() * options.length)]
}

// Picks the line for a correct answer at the given (1-indexed) consecutive-
// correct streak count. A streak milestone (mode-specific, see
// STREAK_MILESTONES) replaces the normal correct pool entirely — only one
// voice ever plays per answer. Any other streak count picks randomly from
// the normal pool, never repeating the immediately-previous pick.
export function pickCorrectFeedback(streak: number, mode: QuestionMode, lastCorrectId: string | null): FeedbackClip {
  const milestone = STREAK_MILESTONES[mode][streak]
  if (milestone) return clipFor(milestone)
  return clipFor(pickWithoutImmediateRepeat(NORMAL_CORRECT_LINES, lastCorrectId))
}

// Picks a random wrong-answer line, never repeating the immediately-
// previous pick.
export function pickIncorrectFeedback(lastWrongId: string | null): FeedbackClip {
  return clipFor(pickWithoutImmediateRepeat(INCORRECT_LINES, lastWrongId))
}

// Played once at session end, judged by accuracy (not rounded) rather than
// raw mistake count — identical thresholds for 8- and 15-question sessions.
// Checked from the highest bar down, so a flawless run always gets かんぺき
// rather than falling through to すごい.
export function pickResultFeedback(correctCount: number, questionCount: number): FeedbackClip {
  const accuracy = correctCount / questionCount
  if (accuracy === 1) return clipFor(KANPEKI)
  if (accuracy >= 0.8) return clipFor(SUGOI)
  if (accuracy >= 0.6) return clipFor(CORRECT_SONOCHOUSHI)
  if (accuracy >= 0.4) return clipFor(WRONG_GANBARE)
  return clipFor(EVAL_FAITO)
}
