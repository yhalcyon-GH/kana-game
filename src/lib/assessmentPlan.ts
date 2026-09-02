import type { AnchorWord } from '../data/types'

export type AssessmentFamily = 'kana-quiz' | 'listening' | 'word-builder' | 'word-reading'
export type KanaQuizDirection = 'read' | 'recall'

export type AssessmentQuestion = {
  family: AssessmentFamily
  characterId?: string
  kanaQuizDirection?: KanaQuizDirection
  word?: AnchorWord
  direction: 'kana-to-sound' | 'sound-to-kana'
}

export type AssessmentPlan = { questions: AssessmentQuestion[] }

const QUESTIONS_PER_FAMILY = 5
const WORD_QUESTION_COUNT = 15
const TOTAL_QUESTIONS = 20
const MAX_SAME_FAMILY_RUN = 2

export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function pickDistinctFirst<T>(pool: readonly T[], count: number, rng: () => number, keyOf: (item: T) => string): T[] {
  if (pool.length === 0) return []
  const result: T[] = []
  let remaining = shuffleWithRng(pool, rng)
  while (result.length < count) {
    if (remaining.length === 0) remaining = shuffleWithRng(pool, rng)
    const next = remaining.shift()
    if (!next) break
    if (result.length < pool.length || !result.some((item) => keyOf(item) === keyOf(next))) result.push(next)
    else result.push(next)
  }
  return result.slice(0, count)
}

// Select all 15 word questions as one coordinated pool. While unused words
// remain, never repeat a target. At each step prefer the word that adds the
// most not-yet-covered kana; seeded shuffling breaks ties deterministically.
function pickCoverageWords(words: readonly AnchorWord[], count: number, rng: () => number): AnchorWord[] {
  if (words.length === 0) return []
  const selected: AnchorWord[] = []
  const covered = new Set<string>()
  const used = new Set<string>()

  while (selected.length < count) {
    let candidates = words.filter((word) => !used.has(word.id))
    if (candidates.length === 0) {
      used.clear()
      candidates = [...words]
    }

    const shuffled = shuffleWithRng(candidates, rng)
    let best = shuffled[0]
    let bestGain = -1
    for (const candidate of shuffled) {
      const gain = new Set(candidate.characterIds.filter((id) => !covered.has(id))).size
      if (gain > bestGain) {
        best = candidate
        bestGain = gain
      }
    }
    if (!best) break
    selected.push(best)
    used.add(best.id)
    best.characterIds.forEach((id) => covered.add(id))
  }
  return selected
}

function buildKanaQuizQuestions(
  characterIds: readonly string[],
  coveredByWords: ReadonlySet<string>,
  rng: () => number,
): AssessmentQuestion[] {
  const randomized = shuffleWithRng(characterIds, rng)
  const uncovered = randomized.filter((id) => !coveredByWords.has(id))
  const covered = randomized.filter((id) => coveredByWords.has(id))
  const ordered = [...uncovered, ...covered]
  const targets = pickDistinctFirst(ordered, QUESTIONS_PER_FAMILY, rng, (id) => id)
  const directions: KanaQuizDirection[] = shuffleWithRng(['read', 'read', 'read', 'recall', 'recall'], rng)
  return targets.map((characterId, i) => ({
    family: 'kana-quiz',
    characterId,
    kanaQuizDirection: directions[i],
    direction: directions[i] === 'read' ? 'kana-to-sound' : 'sound-to-kana',
  }))
}

function buildWordFamilyQuestions(
  family: 'listening' | 'word-builder' | 'word-reading',
  targets: readonly AnchorWord[],
): AssessmentQuestion[] {
  const direction = family === 'word-reading' ? 'kana-to-sound' : 'sound-to-kana'
  return targets.map((word) => ({ family, word, direction }))
}

function interleave(blocks: Record<AssessmentFamily, AssessmentQuestion[]>, rng: () => number): AssessmentQuestion[] {
  const remaining: Record<AssessmentFamily, AssessmentQuestion[]> = {
    'kana-quiz': [...blocks['kana-quiz']],
    listening: [...blocks.listening],
    'word-builder': [...blocks['word-builder']],
    'word-reading': [...blocks['word-reading']],
  }
  const result: AssessmentQuestion[] = []
  let lastFamily: AssessmentFamily | null = null
  let lastRun = 0

  while (result.length < TOTAL_QUESTIONS) {
    const families = shuffleWithRng(
      (Object.keys(remaining) as AssessmentFamily[]).filter((family) => remaining[family].length > 0),
      rng,
    )
    const safeChoices = families.filter((family) => !(family === lastFamily && lastRun >= MAX_SAME_FAMILY_RUN))
    const choices = safeChoices.length > 0 ? safeChoices : families
    const chosenFamily = [...choices].sort((a, b) => remaining[b].length - remaining[a].length)[0]
    if (!chosenFamily) break
    const next = remaining[chosenFamily].shift()
    if (!next) continue
    result.push(next)
    if (chosenFamily === lastFamily) lastRun += 1
    else {
      lastFamily = chosenFamily
      lastRun = 1
    }
  }
  return result
}

export type BuildAssessmentPlanInput = {
  characterIds: readonly string[]
  words: readonly AnchorWord[]
  rng: () => number
}

export function buildAssessmentPlan({ characterIds, words, rng }: BuildAssessmentPlanInput): AssessmentPlan {
  const selectedWords = pickCoverageWords(words, WORD_QUESTION_COUNT, rng)
  const randomizedWords = shuffleWithRng(selectedWords, rng)
  const listeningWords = randomizedWords.slice(0, QUESTIONS_PER_FAMILY)
  const wordBuilderWords = randomizedWords.slice(QUESTIONS_PER_FAMILY, QUESTIONS_PER_FAMILY * 2)
  const wordReadingWords = randomizedWords.slice(QUESTIONS_PER_FAMILY * 2, QUESTIONS_PER_FAMILY * 3)
  const coveredByWords = new Set(selectedWords.flatMap((word) => word.characterIds))

  const blocks: Record<AssessmentFamily, AssessmentQuestion[]> = {
    'kana-quiz': buildKanaQuizQuestions(characterIds, coveredByWords, rng),
    listening: buildWordFamilyQuestions('listening', listeningWords),
    'word-builder': buildWordFamilyQuestions('word-builder', wordBuilderWords),
    'word-reading': buildWordFamilyQuestions('word-reading', wordReadingWords),
  }
  return { questions: interleave(blocks, rng) }
}
