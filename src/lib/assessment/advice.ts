import { PRACTICE_CHECKPOINTS_BY_ID } from '../../data/practiceCheckpoints'
import type { AssessmentFamily, AssessmentRecommendation, AssessmentResult } from './types'

// Below this accuracy, a family counts as "weak" for advice purposes — see
// getAssessmentAdvice below. Not a pass/fail threshold: the test itself
// never gates progression on score (Issue #189), this only decides which
// existing practice to point the learner back at.
const WEAK_THRESHOLD = 0.6
// Word Builder is called out by the issue as "the strongest general
// recommendation when sound->spelling construction is weak" — a small
// priority nudge so it wins ties against an equally-weak family, without
// overriding a genuinely more urgent weakness elsewhere.
const WORD_BUILDER_PRIORITY_BONUS = 0.01

type Candidate = { recommendation: AssessmentRecommendation; priority: number }

function accuracy(correct: number, total: number): number {
  return total > 0 ? correct / total : 1
}

// Maps assessment diagnostics to EXISTING practice routes only (Issue #189:
// "Use actual existing routes/data; do not invent dead links") — never a new
// review system. At most 2 prioritized recommendations, ranked by how weak
// each family was.
export function getAssessmentAdvice(result: AssessmentResult): AssessmentRecommendation[] {
  const script = result.script
  const scriptLabel = script === 'hiragana' ? 'Hiragana' : 'Katakana'
  const summaryRowId = `${script}-summary`
  const candidates: Candidate[] = []

  const addIfWeak = (family: AssessmentFamily, recommendation: AssessmentRecommendation, priorityBonus = 0) => {
    const score = result.familyScores[family]
    const familyAccuracy = accuracy(score.correct, score.total)
    if (score.total > 0 && familyAccuracy < WEAK_THRESHOLD) {
      candidates.push({ recommendation, priority: 1 - familyAccuracy + priorityBonus })
    }
  }

  addIfWeak('kana-quiz', {
    label: `${scriptLabel} Kana Quiz`,
    to: `/practice/${script}/${summaryRowId}/kana-quiz`,
    reason: 'kana-quiz',
  })
  addIfWeak('listening', {
    label: `${scriptLabel} Listening`,
    to: `/practice/${script}/${summaryRowId}/listening`,
    reason: 'listening',
  })
  addIfWeak(
    'word-builder',
    { label: `${scriptLabel} Word Builder`, to: `/practice/${script}/${summaryRowId}/word-builder`, reason: 'word-builder' },
    WORD_BUILDER_PRIORITY_BONUS,
  )
  // Hiragana's reading-practice recommendation reuses its final Restaurant
  // checkpoint; Katakana's reuses its Cafe checkpoint (Issue #189's mapping)
  // — both existing, real routes, looked up rather than hardcoded so they
  // stay valid if a checkpoint's routePath ever changes.
  const readingCheckpoint = PRACTICE_CHECKPOINTS_BY_ID[script === 'hiragana' ? 'hiragana-complete' : 'katakana-ha-row']
  if (readingCheckpoint) {
    addIfWeak('word-reading', {
      label: script === 'hiragana' ? 'Restaurant Practice' : 'Cafe Practice',
      to: readingCheckpoint.routePath,
      reason: 'word-reading',
    })
  }

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2)
    .map((c) => c.recommendation)
}
