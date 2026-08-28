// The five score-illustration images (see public/summary-results/) shown
// beside the {correct}/{total} score in the completed graded Practice
// summary (Kana Quiz, Listening, Word Builder, Kana Typing) — see
// PracticeSummary. Order matters: index 0 is the lowest-accuracy image,
// index 4 the perfect-score image.
export const PRACTICE_RESULT_IMAGES = [
  'summary-results/summary-result-1.webp',
  'summary-results/summary-result-2.webp',
  'summary-results/summary-result-3.webp',
  'summary-results/summary-result-4.webp',
  'summary-results/summary-result-5.webp',
] as const

// Picks the result image for a graded session's score, judged by accuracy
// (not rounded), checked from the highest bar down so a flawless run always
// gets image 5 rather than falling through to image 4. Mirrors
// feedbackVoice.ts's pickResultFeedback threshold style/order.
export function pickPracticeResultImage(score: { correct: number; total: number }): string {
  const accuracy = score.total > 0 ? score.correct / score.total : 0
  if (accuracy === 1) return PRACTICE_RESULT_IMAGES[4]
  if (accuracy >= 0.75) return PRACTICE_RESULT_IMAGES[3]
  if (accuracy >= 0.5) return PRACTICE_RESULT_IMAGES[2]
  if (accuracy >= 0.25) return PRACTICE_RESULT_IMAGES[1]
  return PRACTICE_RESULT_IMAGES[0]
}
