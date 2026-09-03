import type { AssessmentFamily, AssessmentQuestion } from './assessmentPlan'

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

type RecommendationSource = { practiceRoute: string; checkpointRoute?: string; checkpointLabel?: string }

const RECOMMENDATION_SOURCES: Record<'hiragana' | 'katakana', Record<AssessmentFamily, RecommendationSource>> = {
  hiragana: {
    'kana-quiz': { practiceRoute: '/practice/hiragana/hiragana-summary/kana-quiz' },
    listening: { practiceRoute: '/practice/hiragana/hiragana-summary/listening' },
    'word-builder': { practiceRoute: '/practice/hiragana/hiragana-summary/word-builder' },
    'word-reading': {
      practiceRoute: '/practice/hiragana/hiragana-summary/word-builder',
      checkpointRoute: '/restaurant/hiragana-complete',
      checkpointLabel: 'Restaurant Practice',
    },
  },
  katakana: {
    'kana-quiz': { practiceRoute: '/practice/katakana/katakana-summary/kana-quiz' },
    listening: { practiceRoute: '/practice/katakana/katakana-summary/listening' },
    'word-builder': { practiceRoute: '/practice/katakana/katakana-summary/word-builder' },
    'word-reading': {
      practiceRoute: '/practice/katakana/katakana-summary/word-builder',
      checkpointRoute: '/restaurant/katakana-complete',
      checkpointLabel: 'Restaurant Practice',
    },
  },
}

const FAMILY_LABELS: Record<AssessmentFamily, string> = {
  'kana-quiz': 'Kana Quiz',
  listening: 'Listening',
  'word-builder': 'Word Builder',
  'word-reading': 'Word Reading',
}

function accuracy(score: FamilyScore): number {
  return score.total > 0 ? score.correct / score.total : 1
}

export function getPracticeRecommendations(
  results: AssessmentResults,
  script: 'hiragana' | 'katakana',
): PracticeRecommendation[] {
  const weakFamilies = (Object.keys(results.familyScores) as AssessmentFamily[])
    .filter((family) => accuracy(results.familyScores[family]) < RECOMMENDATION_ACCURACY_THRESHOLD)

  // Word Builder is the strongest general remediation when sound→spelling
  // construction itself is weak. Put it first whenever that family is weak,
  // then use the lowest-accuracy remaining family as the second suggestion.
  const ordered: AssessmentFamily[] = []
  if (weakFamilies.includes('word-builder')) ordered.push('word-builder')
  ordered.push(
    ...weakFamilies
      .filter((family) => family !== 'word-builder')
      .sort((a, b) => accuracy(results.familyScores[a]) - accuracy(results.familyScores[b])),
  )

  return ordered.slice(0, 2).map((family) => {
    const source = RECOMMENDATION_SOURCES[script][family]
    if (family === 'word-reading' && source.checkpointRoute) {
      return { label: `Practice: ${source.checkpointLabel}`, to: source.checkpointRoute }
    }
    return { label: `Practice: ${FAMILY_LABELS[family]}`, to: source.practiceRoute }
  })
}
