import type { AnchorWord } from '../data/types'

// Phase 1 of the Hiragana/Katakana mixed assessment test (Issue #189) — a
// 20-question, section-endpoint diagnostic that mixes 4 existing-mechanic
// question families (5 questions each) plus interleaves them so no 3+
// consecutive questions share a family where avoidable. This module is pure
// planning logic: it decides WHICH 20 questions to ask, in what order, and
// with what metadata — the actual games (Kana Quiz/Listening/Word Builder)
// and the new Word Reading mechanic still do their own answer-checking; see
// routes/games/AssessmentPage.tsx for how a plan is turned into a session.
//
// Deliberately NOT reusing useGameSession's weighted/box-based queueing —
// this is a fixed-size, fixed-composition diagnostic over a whole category,
// not a spaced-repetition practice queue (same reasoning as
// SUMMARY_SESSION_ROUNDS's own fixed-length design, see useCurriculum.ts).

export type AssessmentFamily = 'kana-quiz' | 'listening' | 'word-builder' | 'word-reading'

// Kana Quiz's own two directions (see KanaQuizPage's top comment) — the
// assessment must explicitly cover both across its 5 Kana Quiz questions
// (see the issue's "Family 1" requirement), not leave it to chance.
export type KanaQuizDirection = 'read' | 'recall'

export type AssessmentQuestion = {
  family: AssessmentFamily
  // For 'kana-quiz': the target character id, plus its tested direction.
  characterId?: string
  kanaQuizDirection?: KanaQuizDirection
  // For 'listening' / 'word-builder' / 'word-reading': the target word.
  word?: AnchorWord
  // Diagnostic-signal grouping (see the issue's "Results / diagnostics"
  // section) — derived once at plan time so scoring/results code doesn't
  // need to re-derive family/direction mappings itself.
  //   Kana→Sound: Kana Quiz "Read" questions + Word Reading questions.
  //   Sound→Kana: Kana Quiz "Recall" questions + Listening + Word Builder.
  direction: 'kana-to-sound' | 'sound-to-kana'
}

export type AssessmentPlan = {
  questions: AssessmentQuestion[]
}

const QUESTIONS_PER_FAMILY = 5
const TOTAL_QUESTIONS = 20
const MAX_SAME_FAMILY_RUN = 2

// Minimal seedable PRNG (mulberry32) so a caller can inject a numeric seed
// and get fully deterministic output — Math.random() itself can't be
// seeded. Test-only determinism requirement from the issue; production
// callers pass Date.now()-derived or Math.random()-derived seeds so retakes
// vary (see buildAssessmentPlan's `rng` param default).
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

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Picks up to `count` items maximizing distinct coverage across the pool: if
// the pool is smaller than needed, every item is used before anything
// repeats (round-robin over shuffled copies of the pool) — this is the
// "maximize distinct kana coverage" requirement combined with the reality
// that a small category (or a category's characters minus what's already
// used by other families this session) may have fewer unique items than
// slots to fill.
function pickDistinctFirst<T>(pool: readonly T[], count: number, rng: () => number, keyOf: (item: T) => string): T[] {
  if (pool.length === 0) return []
  const result: T[] = []
  const usedKeys = new Set<string>()
  while (result.length < count) {
    const remaining = pool.filter((item) => !usedKeys.has(keyOf(item)))
    const roundPool = remaining.length > 0 ? remaining : [...pool]
    const shuffled = shuffleWithRng(roundPool, rng)
    for (const item of shuffled) {
      if (result.length >= count) break
      result.push(item)
      usedKeys.add(keyOf(item))
      // Once every distinct item in the whole pool has been used at least
      // once, allow repeats freely (usedKeys resets implicitly next loop
      // via the `remaining.length > 0` fallback above).
      if (usedKeys.size >= pool.length) usedKeys.clear()
    }
  }
  return result.slice(0, count)
}

function buildKanaQuizQuestions(characterIds: readonly string[], rng: () => number): AssessmentQuestion[] {
  const targets = pickDistinctFirst(characterIds, QUESTIONS_PER_FAMILY, rng, (id) => id)
  // Must measure both directions across its 5 questions (issue requirement)
  // — split as evenly as possible (3/2, order randomized) rather than a
  // fixed pattern, so which 3 get which direction still varies by seed.
  const directions: KanaQuizDirection[] = shuffleWithRng(['read', 'read', 'read', 'recall', 'recall'], rng)
  return targets.map((characterId, i) => ({
    family: 'kana-quiz' as const,
    characterId,
    kanaQuizDirection: directions[i],
    direction: directions[i] === 'read' ? ('kana-to-sound' as const) : ('sound-to-kana' as const),
  }))
}

function buildWordFamilyQuestions(
  family: 'listening' | 'word-builder' | 'word-reading',
  words: readonly AnchorWord[],
  rng: () => number,
): AssessmentQuestion[] {
  const targets = pickDistinctFirst(words, QUESTIONS_PER_FAMILY, rng, (w) => w.id)
  const direction = family === 'word-reading' ? ('kana-to-sound' as const) : ('sound-to-kana' as const)
  return targets.map((word) => ({ family, word, direction }))
}

// Interleaves the 4 pre-built 5-question family blocks into one 20-question
// sequence, avoiding 3+ consecutive same-family questions where the
// remaining pool composition allows it (issue requirement: "where
// practical" — with exactly 4 families x 5 questions each, an avoidable
// violation is always achievable, but the algorithm stays a best-effort
// greedy pick rather than an exhaustive constraint solver, matching the
// "where practical" wording).
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
      (Object.keys(remaining) as AssessmentFamily[]).filter((f) => remaining[f].length > 0),
      rng,
    )
    // Never choose a family that would extend a same-family run past the
    // max UNLESS doing so is the only way to place every remaining question
    // (i.e. every other family is also blocked, or picking this family is
    // literally the only family with items left) — a placement is "safe" to
    // defer only if there's still room (in remaining slots) for at least
    // one other family question to land before this family must resume.
    const blocked = (f: AssessmentFamily) => f === lastFamily && lastRun >= MAX_SAME_FAMILY_RUN
    const safeChoices = families.filter((f) => !blocked(f))
    // Prefer the family with the MOST items left among safe choices, so no
    // single family gets starved into a forced run later (greedy
    // max-remaining strategy avoids the earlier bug where a small family
    // got picked early, ran out, and forced a later run in a still-larger
    // family).
    const byMostRemaining = (a: AssessmentFamily, b: AssessmentFamily) => remaining[b].length - remaining[a].length
    const chosenFamily = safeChoices.length > 0 ? [...safeChoices].sort(byMostRemaining)[0] : families[0]
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
  // Category-scoped character pool (e.g. hiragana-summary's characterIds) —
  // Kana Quiz's target pool. Callers must pre-filter to quizzable
  // characters (see useCurriculum's isQuizzableCharacterId) the same way
  // normal Kana Quiz does.
  characterIds: readonly string[]
  // Category-scoped word pool (e.g. hiragana-summary's word list via
  // useCurriculum's getScopeWords) — shared by Listening/Word
  // Builder/Word Reading. All three deliberately draw from the SAME pool
  // (not disjoint slices) so "maximize distinct kana coverage" can pick
  // whichever specific words best cover the category for each family
  // independently, per the issue's phrasing.
  words: readonly AnchorWord[]
  // Injectable RNG (see createSeededRng) — required, not optional, so a
  // caller can never accidentally get non-deterministic output in a test
  // while still being free to pass `Math.random` in production for real
  // retake variety (see AssessmentPage.tsx).
  rng: () => number
}

// Builds one complete 20-question assessment plan: exactly 5 questions per
// family, both Kana Quiz directions represented, distinct-kana-coverage
// maximized within each family's own target pool, and no 3+ consecutive
// same-family run where avoidable — see the issue's full "Assessment
// structure" section.
export function buildAssessmentPlan({ characterIds, words, rng }: BuildAssessmentPlanInput): AssessmentPlan {
  const blocks: Record<AssessmentFamily, AssessmentQuestion[]> = {
    'kana-quiz': buildKanaQuizQuestions(characterIds, rng),
    listening: buildWordFamilyQuestions('listening', words, rng),
    'word-builder': buildWordFamilyQuestions('word-builder', words, rng),
    'word-reading': buildWordFamilyQuestions('word-reading', words, rng),
  }
  return { questions: interleave(blocks, rng) }
}
