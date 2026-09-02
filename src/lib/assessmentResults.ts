import type { AssessmentFamily, AssessmentQuestion } from './assessmentPlan'

// Scoring/diagnostics for one completed assessment session — see Issue
// #189's "Results / diagnostics" and "Practice recommendations" sections.
// Deliberately pure and derived entirely from the same 20 answered
// questions' metadata; no new persisted state, no Review/SRS/mastery
// mutation (see AssessmentPage.tsx, which is the only caller, and
// progressStore's markAssessmentCompleted, which persists only pass/fail +
// a timestamp — not these derived scores).

export type AssessmentAnswer = {
  question: AssessmentQuestion
  correct: boolean
}

export type FamilyScore = { correct: number; total: number }
export type DirectionScore = { correct: number; total: number }

export type AssessmentResults = {
  familyScores: Record<AssessmentFamily, FamilyScore>
  directionScores: {
    kanaToSound: DirectionScore
    soundToKana: DirectionScore
  }
  // Character/word ids missed at least once this session — "repeated weak
  // kana" per the issue's diagnostics requirement. Kept as ids only (not a
  // full mistake object) since callers already have the full AnchorWord/
  // character lookup tables to resolve display info from an id.
  weakCharacterIds: string[]
  weakWordIds: string[]
  overallCorrect: number
  overallTotal: number
}

const EMPTY_FAMILY_SCORES = (): Record<AssessmentFamily, FamilyScore> => ({
  'kana-quiz': { correct: 0, total: 0 },
  listening: { correct: 0, total: 0 },
  'word-builder': { correct: 0, total: 0 },
  'word-reading': { correct: 0, total: 0 },
})

export function computeAssessmentResults(answers: AssessmentAnswer[]): AssessmentResults {
  const familyScores = EMPTY_FAMILY_SCORES()
  const directionScores = { kanaToSound: { correct: 0, total: 0 }, soundToKana: { correct: 0, total: 0 } }
  const weakCharacterIds = new Set<string>()
  const weakWordIds = new Set<string>()
  let overallCorrect = 0

  for (const { question, correct } of answers) {
    familyScores[question.family].total += 1
    if (correct) familyScores[question.family].correct += 1

    const directionBucket = question.direction === 'kana-to-sound' ? directionScores.kanaToSound : directionScores.soundToKana
    directionBucket.total += 1
    if (correct) directionBucket.correct += 1

    if (correct) overallCorrect += 1
    else {
      if (question.characterId) weakCharacterIds.add(question.characterId)
      if (question.word) weakWordIds.add(question.word.id)
    }
  }

  return {
    familyScores,
    directionScores,
    weakCharacterIds: [...weakCharacterIds],
    weakWordIds: [...weakWordIds],
    overallCorrect,
    overallTotal: answers.length,
  }
}

export type PracticeRecommendation = { label: string; to: string }

const RECOMMENDATION_ACCURACY_THRESHOLD = 0.7

// Which family (if weak) recommends which existing practice route — issue
// requirement: "Recommend existing practice routes, not a new review
// system," at most 1-2 shown, keyed by script (hiragana/katakana) since the
// Restaurant/Cafe checkpoint routes differ per script.
type RecommendationSource = { practiceRoute: string; checkpointRoute?: string; checkpointLabel?: string }

const RECOMMENDATION_SOURCES: Record<'hiragana' | 'katakana', Record<AssessmentFamily, RecommendationSource>> = {
  hiragana: {
    'kana-quiz': { practiceRoute: '/practice/hiragana/hiragana-summary/kana-quiz' },
    listening: { practiceRoute: '/practice/hiragana/hiragana-summary/listening' },
    'word-builder': { practiceRoute: '/practice/hiragana/hiragana-summary/word-builder' },
    'word-reading': { practiceRoute: '/practice/hiragana/hiragana-summary/word-builder', checkpointRoute: '/restaurant/hiragana-complete', checkpointLabel: 'Restaurant Practice' },
  },
  katakana: {
    'kana-quiz': { practiceRoute: '/practice/katakana/katakana-summary/kana-quiz' },
    listening: { practiceRoute: '/practice/katakana/katakana-summary/listening' },
    'word-builder': { practiceRoute: '/practice/katakana/katakana-summary/word-builder' },
    'word-reading': { practiceRoute: '/practice/katakana/katakana-summary/word-builder', checkpointRoute: '/restaurant/katakana-complete', checkpointLabel: 'Cafe/Restaurant Practice' },
  },
}

const FAMILY_LABELS: Record<AssessmentFamily, string> = {
  'kana-quiz': 'Kana Quiz',
  listening: 'Listening',
  'word-builder': 'Word Builder',
  'word-reading': 'Word Reading',
}

// Returns the 1-2 most useful recommendations: the family(ies) with the
// lowest accuracy below RECOMMENDATION_ACCURACY_THRESHOLD, worst first. If
// nothing is weak, returns an empty list (a strong result needs no
// remediation advice).
export function getPracticeRecommendations(
  results: AssessmentResults,
  script: 'hiragana' | 'katakana',
): PracticeRecommendation[] {
  const families = (Object.keys(results.familyScores) as AssessmentFamily[])
    .map((family) => ({ family, score: results.familyScores[family] }))
    .filter(({ score }) => score.total > 0 && score.correct / score.total < RECOMMENDATION_ACCURACY_THRESHOLD)
    .sort((a, b) => a.score.correct / a.score.total - b.score.correct / b.score.total)
    .slice(0, 2)

  return families.map(({ family }) => {
    const source = RECOMMENDATION_SOURCES[script][family]
    if (family === 'word-reading' && source.checkpointRoute) {
      return { label: `Practice: ${source.checkpointLabel}`, to: source.checkpointRoute }
    }
    return { label: `Practice: ${FAMILY_LABELS[family]}`, to: source.practiceRoute }
  })
}
