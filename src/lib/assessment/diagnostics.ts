import { ASSESSMENT_FAMILIES } from './planner'
import type { AssessmentAnswer, AssessmentFamily, AssessmentFamilyScore, AssessmentResult, AssessmentScript } from './types'

// Pure scoring pass: turns one assessment's per-question answers into an
// overall score, four family subscores, and the concrete weak kana/words
// derivable from wrong answers (Issue #189's diagnostics requirement).
// Deliberately does not touch Review/SRS/mastery/box state — an assessment
// answer is measurement, not practice (see the issue's "do not immediately
// repeat missed targets" / "must not fabricate Review/SRS mastery").
export function scoreAssessment(script: AssessmentScript, answers: readonly AssessmentAnswer[]): AssessmentResult {
  const familyScores = Object.fromEntries(
    ASSESSMENT_FAMILIES.map((family) => [family, { correct: 0, total: 0 }]),
  ) as Record<AssessmentFamily, AssessmentFamilyScore>

  const weakCharIds = new Set<string>()
  const weakWordIds = new Set<string>()
  let correct = 0

  for (const answer of answers) {
    const familyScore = familyScores[answer.family]
    familyScore.total++
    if (answer.correct) {
      familyScore.correct++
      correct++
    } else {
      answer.coveredCharIds.forEach((id) => weakCharIds.add(id))
      if (answer.targetWordId) weakWordIds.add(answer.targetWordId)
    }
  }

  const total = answers.length
  return {
    script,
    correct,
    total,
    percent: total > 0 ? Math.round((correct / total) * 100) : 0,
    familyScores,
    weakCharIds: [...weakCharIds],
    weakWordIds: [...weakWordIds],
  }
}
