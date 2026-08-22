// The Recommended Path is a separate, simpler system from Review (see
// lib/srs.ts): Review recovers weak/missed items after the fact, while
// Recommended Path just guides a first-time pass through the row's core
// activities so a learner never has to decide what to do next. Neither one
// gates the other — see PracticeHubPage/the 4 game pages' callers.
export type RecommendedActivity = 'learn' | 'kana-quiz' | 'listening' | 'word-builder' | 'done'

export type RecommendedPathInput = {
  // 'contrast-pairs' rows (促音/長音) have no Kana Quiz step — see
  // useCurriculum's isQuizzableCharacterId comment for why.
  learnStyle: 'character-set' | 'contrast-pairs'
  // "Character introduction" is complete once EITHER Learn or Tracing has
  // been finished once — neither is required over the other, and finishing
  // one never locks out the other (see PracticeHubPage's "Choose how to
  // learn" step).
  introCompleted: boolean
  kanaQuizCompleted: boolean
  listeningCompleted: boolean
  wordBuilderCompleted: boolean
}

// Pure function: given a row's current completion state, what's the ONE
// next recommended activity? 'done' means Word Builder has been completed
// too — the row's core path is finished (see PracticeHubPage's "Lesson
// complete" / Next Row treatment). Kana Typing never appears here — it's
// optional and never part of this sequence.
export function getRecommendedActivity(input: RecommendedPathInput): RecommendedActivity {
  if (!input.introCompleted) return 'learn'
  if (input.learnStyle === 'character-set' && !input.kanaQuizCompleted) return 'kana-quiz'
  if (!input.listeningCompleted) return 'listening'
  if (!input.wordBuilderCompleted) return 'word-builder'
  return 'done'
}
