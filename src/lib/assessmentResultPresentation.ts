export type AssessmentResultPresentation = {
  label: 'FAIL' | 'PASS' | 'PERFECT' | 'GRADUATED' | 'MASTERED'
  image: string
  audioKey: string
  showCrown: boolean
}

export function getAssessmentResultPresentation({
  correct,
  total,
  isFinal,
}: {
  correct: number
  total: number
  isFinal: boolean
}): AssessmentResultPresentation {
  const accuracy = total > 0 ? correct / total : 0
  if (accuracy === 1) {
    return isFinal
      ? { label: 'MASTERED', image: 'assessment-results/final-mastered.png', audioKey: 'feedback/assessment-results/final-mastered', showCrown: true }
      : { label: 'PERFECT', image: 'assessment-results/assessment-perfect.png', audioKey: 'feedback/assessment-results/assessment-perfect', showCrown: true }
  }
  if (accuracy >= 0.8) {
    return isFinal
      ? { label: 'GRADUATED', image: 'assessment-results/final-graduated.png', audioKey: 'feedback/assessment-results/final-graduated', showCrown: false }
      : { label: 'PASS', image: 'assessment-results/assessment-pass.png', audioKey: 'feedback/assessment-results/assessment-pass', showCrown: false }
  }
  return { label: 'FAIL', image: 'assessment-results/assessment-fail.png', audioKey: 'feedback/assessment-results/assessment-fail', showCrown: false }
}
