// Simplified 5-box Leitner spaced-repetition logic. Deliberately gentler
// than classic Leitner (drop by one box on a miss, not straight to 0) since
// the audience is absolute beginners — one mistake shouldn't erase several
// rounds of progress and discourage continued play. Drives row-unlock
// timing (meetsAdvanceThreshold) and practice-queue weighting
// (weightForBox) ONLY — Review inclusion is a separate mechanism, see
// REVIEW_STREAK_TARGET/applyReviewResult below.
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
// word carries its own active/streak pair (see progressStore.ts's
// CharacterProgress/WordProgress), independent of box.
//
// Rule: a miss puts an item into Review (active, streak reset to 0);
// REVIEW_STREAK_TARGET consecutive correct answers while active graduate it
// back out. A miss at any point resets the streak to 0 without leaving
// Review. This applies regardless of whether the item was answered inside a
// Review session or normal row Practice - see the 4 game pages' callers of
// progressStore's recordCharacterReviewResult/recordWordReviewResult.
//
// Character vs word Review are independent pools (see useCurriculum's
// weakCharacterIds/weakWords) - which game touches which is a per-game
// decision (e.g. Kana Quiz only ever touches character Review; Listening/
// Kana Typing only ever touch word Review; Word Builder touches both, using
// its real per-character precision).
export const REVIEW_STREAK_TARGET = 2

export type ReviewProgress = {
  reviewActive: boolean
  reviewStreak: number
}

// Single reducer covering both the "enters/stays in Review" and
// "progresses/graduates" paths - a wrong answer always resets to active/0
// regardless of prior state; a correct answer only does anything if the
// item is currently active (a correct answer on an inactive item is a
// no-op, so calling this unconditionally on every answer is safe).
export function applyReviewResult(current: ReviewProgress, correct: boolean): ReviewProgress {
  if (!correct) return { reviewActive: true, reviewStreak: 0 }
  if (!current.reviewActive) return current
  const streak = current.reviewStreak + 1
  if (streak >= REVIEW_STREAK_TARGET) return { reviewActive: false, reviewStreak: 0 }
  return { reviewActive: true, reviewStreak: streak }
}
