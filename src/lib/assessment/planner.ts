import { getConfusableIds } from '../../data/distractors'
import type { AnchorWord } from '../../data/types'
import type {
  AssessmentFamily,
  AssessmentQuestion,
  AssessmentScope,
  KanaQuizAssessmentQuestion,
  ListeningAssessmentQuestion,
  WordBuilderAssessmentQuestion,
  WordReadingAssessmentQuestion,
} from './types'

export const ASSESSMENT_QUESTION_COUNT = 20
export const ASSESSMENT_FAMILIES: AssessmentFamily[] = ['kana-quiz', 'listening', 'word-builder', 'word-reading']
export const QUESTIONS_PER_FAMILY = 5
const WORD_QUESTION_COUNT = QUESTIONS_PER_FAMILY * 3 // listening + word-builder + word-reading
const KANA_QUIZ_DISTRACTOR_COUNT = 3
const WORD_DISTRACTOR_COUNT = 3

// Injectable purely so tests can assert exact, reproducible plans instead of
// relying on statistical fuzziness — production callers never pass it (see
// lib/similarLettersSelection.ts's identical convention). Deliberately does
// NOT reuse lib/shuffle.ts or lib/distractorPicker.ts, which are hardcoded
// to Math.random and intentionally left untouched (same reasoning as
// similarLettersSelection.ts's own top comment).
export type Rng = () => number

function shuffleWith<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Same confusable-first-then-random priority as lib/distractorPicker.ts's
// pickDistractorCharIds, reimplemented with an injectable rng.
function pickDistractorCharIds(targetCharIds: readonly string[], pool: readonly string[], count: number, rng: Rng): string[] {
  const targetSet = new Set(targetCharIds)
  const confusable = [...new Set(targetCharIds.flatMap((id) => getConfusableIds(id)))].filter(
    (id) => pool.includes(id) && !targetSet.has(id),
  )
  const rest = pool.filter((id) => !targetSet.has(id) && !confusable.includes(id))
  return shuffleWith(confusable, rng).concat(shuffleWith(rest, rng)).slice(0, count)
}

// Same priority as lib/distractorPicker.ts's pickDistractorWords, with an
// injectable rng.
function pickDistractorWords(target: AnchorWord, candidates: readonly AnchorWord[], count: number, rng: Rng): AnchorWord[] {
  const others = candidates.filter((w) => w.id !== target.id)
  const isConfusable = (w: AnchorWord) =>
    w.characterIds.some((cid) => target.characterIds.some((tid) => getConfusableIds(tid).includes(cid)))
  const preferred = shuffleWith(others.filter(isConfusable), rng)
  const rest = shuffleWith(others.filter((w) => !isConfusable(w)), rng)
  return [...preferred, ...rest].slice(0, count)
}

// Same even-split Read/Recall plan as lib/quizModePlan.ts's
// buildQuizModePlan, with an injectable rng.
function buildModePlan(count: number, rng: Rng): ('read' | 'recall')[] {
  const half = Math.floor(count / 2)
  const remainder = count - half * 2
  const modes: ('read' | 'recall')[] = [...Array(half).fill('read'), ...Array(half).fill('recall')]
  if (remainder > 0) modes.push(rng() < 0.5 ? 'read' : 'recall')
  return shuffleWith(modes, rng)
}

// Greedily selects WORD_QUESTION_COUNT distinct words maximizing NEW
// character coverage at each pick (Issue #189's "prefer targets that cover
// kana not already represented" coverage strategy) — never repeats a word
// while an unused eligible one remains, since every pick is removed from the
// remaining pool. Falls back to cycling the (shuffled) full pool only in the
// degenerate case where the script has fewer than WORD_QUESTION_COUNT words.
function selectCoverageWords(words: readonly AnchorWord[], rng: Rng): { selected: AnchorWord[]; covered: Set<string> } {
  const shuffled = shuffleWith(words, rng)
  const remaining = [...shuffled]
  const selected: AnchorWord[] = []
  const covered = new Set<string>()
  while (selected.length < WORD_QUESTION_COUNT && remaining.length > 0) {
    let bestIndex = 0
    let bestNewCount = -1
    remaining.forEach((word, index) => {
      const newCount = word.characterIds.filter((id) => !covered.has(id)).length
      if (newCount > bestNewCount) {
        bestNewCount = newCount
        bestIndex = index
      }
    })
    const [word] = remaining.splice(bestIndex, 1)
    selected.push(word)
    word.characterIds.forEach((id) => covered.add(id))
  }
  while (selected.length < WORD_QUESTION_COUNT && shuffled.length > 0) {
    selected.push(shuffled[selected.length % shuffled.length])
  }
  return { selected, covered }
}

// Picks QUESTIONS_PER_FAMILY Kana Quiz targets, preferring characters not
// already covered by the selected word questions — the same coverage
// strategy applied to the character side of the plan.
function selectKanaQuizTargets(characterIds: readonly string[], covered: ReadonlySet<string>, rng: Rng): string[] {
  const uncovered = shuffleWith(
    characterIds.filter((id) => !covered.has(id)),
    rng,
  )
  const alreadyCovered = shuffleWith(
    characterIds.filter((id) => covered.has(id)),
    rng,
  )
  const ordered = [...uncovered, ...alreadyCovered]
  const targets = ordered.slice(0, QUESTIONS_PER_FAMILY)
  while (targets.length < QUESTIONS_PER_FAMILY && characterIds.length > 0) {
    targets.push(characterIds[targets.length % characterIds.length])
  }
  return targets
}

// Interleaves the 4 families into 5 blocks, each block a full permutation of
// all 4 families exactly once — guarantees no two adjacent questions share a
// family (a strictly stronger guarantee than the spec's "avoid 3+
// consecutive", chosen because it's simple to construct correctly and easy
// to verify), while still landing exactly QUESTIONS_PER_FAMILY of each
// family evenly spread across the 20 slots rather than clumped into 4
// blocks of 5.
function interleaveFamilies(rng: Rng): AssessmentFamily[] {
  const order: AssessmentFamily[] = []
  let previousLast: AssessmentFamily | null = null
  for (let block = 0; block < QUESTIONS_PER_FAMILY; block++) {
    const permutation = shuffleWith(ASSESSMENT_FAMILIES, rng)
    if (previousLast && permutation[0] === previousLast) {
      const swapIndex = permutation.findIndex((family, index) => index > 0 && family !== previousLast)
      if (swapIndex > 0) [permutation[0], permutation[swapIndex]] = [permutation[swapIndex], permutation[0]]
    }
    order.push(...permutation)
    previousLast = permutation[permutation.length - 1]
  }
  return order
}

// Pure, deterministic-given-rng planner for one 20-question Hiragana/
// Katakana mixed assessment (Issue #189) — builds exactly QUESTIONS_PER_FAMILY
// of each of the 4 assessment families, mixed so no two are adjacent,
// covering as many distinct script-pure kana as the word pool allows without
// ever repeating a target word across the whole test. `scope` must already
// be script-pure (see assessmentScope.ts) — this function does not itself
// filter by script.
export function buildAssessmentPlan(scope: AssessmentScope, rng: Rng = Math.random): AssessmentQuestion[] {
  const { selected: coverageWords, covered } = selectCoverageWords(scope.words, rng)
  const shuffledWords = shuffleWith(coverageWords, rng)
  const listeningWords = shuffledWords.slice(0, QUESTIONS_PER_FAMILY)
  const wordBuilderWords = shuffledWords.slice(QUESTIONS_PER_FAMILY, QUESTIONS_PER_FAMILY * 2)
  const wordReadingWords = shuffledWords.slice(QUESTIONS_PER_FAMILY * 2, QUESTIONS_PER_FAMILY * 3)

  const kanaQuizTargets = selectKanaQuizTargets(scope.characterIds, covered, rng)
  const modes = buildModePlan(QUESTIONS_PER_FAMILY, rng)

  const kanaQuizQuestions: KanaQuizAssessmentQuestion[] = kanaQuizTargets.map((targetCharId, index) => {
    const distractors = pickDistractorCharIds(
      [targetCharId],
      scope.characterIds.filter((id) => id !== targetCharId),
      KANA_QUIZ_DISTRACTOR_COUNT,
      rng,
    )
    return {
      id: `kana-quiz-${index}`,
      family: 'kana-quiz',
      mode: modes[index],
      targetCharId,
      choiceCharIds: shuffleWith([targetCharId, ...distractors], rng),
      coveredCharIds: [targetCharId],
    }
  })

  const listeningQuestions: ListeningAssessmentQuestion[] = listeningWords.map((word, index) => {
    const distractors = pickDistractorWords(word, scope.words, WORD_DISTRACTOR_COUNT, rng)
    return {
      id: `listening-${index}`,
      family: 'listening',
      targetWordId: word.id,
      choiceWordIds: shuffleWith([word, ...distractors], rng).map((w) => w.id),
      coveredCharIds: word.characterIds,
    }
  })

  const wordBuilderQuestions: WordBuilderAssessmentQuestion[] = wordBuilderWords.map((word, index) => ({
    id: `word-builder-${index}`,
    family: 'word-builder',
    targetWordId: word.id,
    distractorCharIds: pickDistractorCharIds(word.characterIds, scope.characterIds, WORD_DISTRACTOR_COUNT, rng),
    coveredCharIds: word.characterIds,
  }))

  const wordReadingQuestions: WordReadingAssessmentQuestion[] = wordReadingWords.map((word, index) => {
    const distractors = pickDistractorWords(word, scope.words, WORD_DISTRACTOR_COUNT, rng)
    return {
      id: `word-reading-${index}`,
      family: 'word-reading',
      targetWordId: word.id,
      romajiChoiceWordIds: shuffleWith([word, ...distractors], rng).map((w) => w.id),
      coveredCharIds: word.characterIds,
    }
  })

  const byFamily: Record<AssessmentFamily, AssessmentQuestion[]> = {
    'kana-quiz': kanaQuizQuestions,
    listening: listeningQuestions,
    'word-builder': wordBuilderQuestions,
    'word-reading': wordReadingQuestions,
  }
  const cursor: Record<AssessmentFamily, number> = { 'kana-quiz': 0, listening: 0, 'word-builder': 0, 'word-reading': 0 }

  return interleaveFamilies(rng).map((family) => byFamily[family][cursor[family]++])
}
