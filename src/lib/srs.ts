// Simplified 5-box Leitner spaced-repetition logic. Deliberately gentler
// than classic Leitner (drop by one box on a miss, not straight to 0) since
// the audience is absolute beginners — one mistake shouldn't erase several
// rounds of progress and discourage continued play.
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

// Classic Leitner review spacing: higher boxes go longer between reviews.
// Box 0 has a 0ms interval, so a never-practiced or recently-missed
// character is always "due" regardless of lastSeen.
const BOX_REVIEW_INTERVAL_MS: Record<number, number> = {
  0: 0,
  1: 1 * 24 * 60 * 60 * 1000,
  2: 3 * 24 * 60 * 60 * 1000,
  3: 7 * 24 * 60 * 60 * 1000,
  4: 14 * 24 * 60 * 60 * 1000,
}

// Whether a character is due for review right now, based on its box and how
// long it's been since it was last seen. Drives the Review scope's word
// selection — see useCurriculum.ts.
export function isDue(stats: { box: number; lastSeen: number }, now: number = Date.now()): boolean {
  const interval = BOX_REVIEW_INTERVAL_MS[stats.box] ?? BOX_REVIEW_INTERVAL_MS[MAX_BOX]
  return now - stats.lastSeen >= interval
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
