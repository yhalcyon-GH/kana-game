// Generic Levenshtein edit distance — used to decide whether a wrong answer
// was a near miss (see pickIncorrectFeedback's おしい gating in
// lib/feedbackVoice.ts). Distance 1 naturally covers both "one character
// off" and "a dakuten/handakuten mistake" (か↔が, は↔ば↔ぱ, ...) in one
// check, since swapping voicing on a single character is itself exactly one
// substitution — no separate dakuten-specific comparison needed.
export function levenshteinDistance<T>(a: readonly T[], b: readonly T[]): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))
  for (let i = 0; i < rows; i++) dp[i][0] = i
  for (let j = 0; j < cols; j++) dp[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[a.length][b.length]
}

// Near miss = exactly one character/element off from correct.
export function isNearMissText(wrong: string, correct: string): boolean {
  return levenshteinDistance([...wrong], [...correct]) === 1
}

export function isNearMissSequence<T>(wrong: readonly T[], correct: readonly T[]): boolean {
  return levenshteinDistance(wrong, correct) === 1
}
