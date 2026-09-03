import { describe, expect, it } from 'vitest'
import { getAssessmentResultPresentation } from './assessmentResultPresentation'

describe('getAssessmentResultPresentation', () => {
  it.each([
    [15, 20, false, 'FAIL', 'assessment-results/assessment-fail.png', 'feedback/assessment-results/assessment-fail'],
    [16, 20, false, 'PASS', 'assessment-results/assessment-pass.png', 'feedback/assessment-results/assessment-pass'],
    [20, 20, false, 'PERFECT', 'assessment-results/assessment-perfect.png', 'feedback/assessment-results/assessment-perfect'],
    [23, 30, true, 'FAIL', 'assessment-results/assessment-fail.png', 'feedback/assessment-results/assessment-fail'],
    [24, 30, true, 'GRADUATED', 'assessment-results/final-graduated.png', 'feedback/assessment-results/final-graduated'],
    [30, 30, true, 'MASTERED', 'assessment-results/final-mastered.png', 'feedback/assessment-results/final-mastered'],
  ])('maps %i/%i (final=%s) to %s', (correct, total, isFinal, label, image, audioKey) => {
    expect(getAssessmentResultPresentation({ correct, total, isFinal })).toMatchObject({ label, image, audioKey })
  })

  it('only awards a crown for a perfect section result or mastered final result', () => {
    expect(getAssessmentResultPresentation({ correct: 20, total: 20, isFinal: false }).showCrown).toBe(true)
    expect(getAssessmentResultPresentation({ correct: 30, total: 30, isFinal: true }).showCrown).toBe(true)
    expect(getAssessmentResultPresentation({ correct: 24, total: 30, isFinal: true }).showCrown).toBe(false)
  })
})
