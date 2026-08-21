// Simplified 5-box Leitner spaced-repetition logic. Deliberately gentler
// than classic Leitner (drop by one box on a miss, not straight to 0) since
// the audience is absolute beginners — one mistake shouldn't erase several
// rounds of progress and discourage continued play. Drives row-unlock
// timing (meetsAdvanceThreshold) and practice-queue weighting
// (weightForBox) ONLY — Review inclusion is a separate mechanism, see
// REVIEW_SCORE_MAX/needsReview below.
export const MIN_BOX = 0
export const MAX_BOX = 4

export function nextBox(box: number, correct: boolean): number {
  if (correct) return Math.min(box + 1, MAX_BOX)
  return Math.max(box - 1, MIN_BOX)
}

const BOX_WEIGHT: Record<number, number> = {
  0: 10,
  1: 6,
  2: 3,
  3: 1.5,
  4: 0.5,
}

export function weightForBox(box: number): number {
  return BOX_WEIGHT[box] ?? BOX_WEIGHT[MAX_BOX]
}

// A character is "advanced enough" to help gate the next row's unlock once
// it's been attempted a few times, reached at least box 2, and answered
// correctly at least 70% of the time. Not full mastery (box 4) — later
// rows' words keep reusing earlier characters anyway, which continues to
// reinforce them.
export function meetsAdvanceThreshold(stats: {
  box: number
  totalSeen: number
  totalCorrect: number
}): boolean {
  if (stats.totalSeen < 3) return false
  if (stats.box < 2) return false
  return stats.totalCorrect / stats.totalSeen >= 0.7
}

// Review inclusion is mistake-driven, not time-driven: every character and
// word carries its own 0-10 reviewScore (see progressStore.ts's
// CharacterProgress/WordProgress), independent of box. A game adjusts it on
// every answer — a precise per-item test (Kana Quiz, Word Builder, which
// know exactly which character was wrong) moves it by a full step
// (±REVIEW_SCORE_MISS_PRECISE/±REVIEW_SCORE_HIT_PRECISE); an imprecise
// whole-word test (Kana Typing, Listening, which can only say the whole
// word was right or wrong) moves every character in that word by a smaller
// step (±REVIEW_SCORE_MISS_IMPRECISE/±REVIEW_SCORE_HIT_IMPRECISE), so a
// single ambiguous slip doesn't have the same weight as a confirmed miss.
// Words get their own score the same way, always ±WORD versions, from
// whichever word-based game was played (Kana Quiz has no word to score).
// This applies regardless of whether the game was played inside a Review
// session or normal practice — see useAnswerFeedback callers.
export const REVIEW_SCORE_MIN = 0
export const REVIEW_SCORE_MAX = 10
export const REVIEW_THRESHOLD = 5

export const REVIEW_SCORE_MISS_PRECISE = 5
export const REVIEW_SCORE_HIT_PRECISE = -2
export const REVIEW_SCORE_MISS_IMPRECISE = 1
export const REVIEW_SCORE_HIT_IMPRECISE = -1
export const REVIEW_SCORE_MISS_WORD = 10
export const REVIEW_SCORE_HIT_WORD = -5

export function clampReviewScore(score: number): number {
  return Math.min(REVIEW_SCORE_MAX, Math.max(REVIEW_SCORE_MIN, score))
}

// Re-evaluated from the current score every time (never "did it just cross
// 5" as a one-off event) — a score can jump straight past the threshold in
// either direction (e.g. 5 -> 3 in one hit), so only a live >= check is
// reliable for both entering and leaving Review.
export function needsReview(score: number): boolean {
  return score >= REVIEW_THRESHOLD
}
