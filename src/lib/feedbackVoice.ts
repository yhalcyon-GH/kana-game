import {
  BONUS_LINES,
  CORRECT_PHRASES,
  CORRECT_RARE_STYLE,
  CORRECT_RARE_STYLE_CHANCE,
  CORRECT_STYLES,
  INCORRECT_PHRASES,
  INCORRECT_RARE_STYLE,
  INCORRECT_RARE_STYLE_CHANCE,
  INCORRECT_STYLES,
  NEAR_MISS_ONLY_PHRASE_KEY,
  PERFECT_PHRASE,
  STREAK_3_PHRASE,
  STREAK_5_PHRASE,
  type Phrase,
  type StyleOption,
} from '../data/feedback'

export type FeedbackClip = { id: string; text: string }

function pickOne<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)]
}

function pickStyle(regular: StyleOption[], rare: StyleOption, rareChance: number): StyleOption {
  return Math.random() < rareChance ? rare : pickOne(regular)
}

function clipFor(phrase: Phrase, style: StyleOption): FeedbackClip {
  return { id: `${phrase.key}-${style.key}`, text: phrase.text }
}

// Picks the line for a correct answer at the given (1-indexed) consecutive-
// correct streak count: a rare Easter-egg line can pre-empt everything else,
// otherwise a streak milestone overrides the regular random pool.
export function pickCorrectFeedback(streak: number): FeedbackClip {
  for (const bonus of BONUS_LINES) {
    if (Math.random() < bonus.chance) return { id: bonus.id, text: bonus.text }
  }
  const phrase = streak === 3 ? STREAK_3_PHRASE : streak === 5 ? STREAK_5_PHRASE : pickOne(CORRECT_PHRASES)
  const style = pickStyle(CORRECT_STYLES, CORRECT_RARE_STYLE, CORRECT_RARE_STYLE_CHANCE)
  return clipFor(phrase, style)
}

// `isNearMiss` gates おしい — it's only fair to say "so close!" when the
// wrong answer really was one character/dakuten off (see
// lib/answerCloseness.ts). Every other incorrect phrase is always eligible.
export function pickIncorrectFeedback(isNearMiss: boolean): FeedbackClip {
  const pool = isNearMiss ? INCORRECT_PHRASES : INCORRECT_PHRASES.filter((p) => p.key !== NEAR_MISS_ONLY_PHRASE_KEY)
  const phrase = pickOne(pool)
  const style = pickStyle(INCORRECT_STYLES, INCORRECT_RARE_STYLE, INCORRECT_RARE_STYLE_CHANCE)
  return clipFor(phrase, style)
}

// Played once at session end when every answer in the session was correct.
export function pickPerfectFeedback(): FeedbackClip {
  const style = pickStyle(CORRECT_STYLES, CORRECT_RARE_STYLE, CORRECT_RARE_STYLE_CHANCE)
  return clipFor(PERFECT_PHRASE, style)
}
