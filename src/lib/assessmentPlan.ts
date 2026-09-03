import type { AnchorWord } from '../data/types'

export type AssessmentFamily = 'kana-quiz' | 'listening' | 'word-builder' | 'word-reading'
export type KanaQuizDirection = 'read' | 'recall'
export type AssessmentDomain = 'youon' | 'special-katakana' | 'basic-hiragana' | 'basic-katakana' | 'dakuon-handakuon' | 'sokuon' | 'long-vowel'

export type AssessmentQuestion = {
  family: AssessmentFamily
  characterId?: string
  kanaQuizDirection?: KanaQuizDirection
  word?: AnchorWord
  direction: 'kana-to-sound' | 'sound-to-kana'
  domain?: AssessmentDomain
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

function takeWithFallback<T>(orderedPool: readonly T[], count: number): T[] {
  if (orderedPool.length === 0) return []
  const result: T[] = []
  while (result.length < count) {
    result.push(orderedPool[result.length % orderedPool.length])
  }
  return result
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
  // Randomize within each priority bucket, but never shuffle the two buckets
  // together: kana not already exercised by the 15 word questions must be
  // chosen before already-covered kana whenever enough targets exist.
  const randomized = shuffleWithRng(characterIds, rng)
  const uncovered = randomized.filter((id) => !coveredByWords.has(id))
  const covered = randomized.filter((id) => coveredByWords.has(id))
  const targets = takeWithFallback([...uncovered, ...covered], QUESTIONS_PER_FAMILY)
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

function domainOf(word: AnchorWord): 'youon' | 'special-katakana' {
  return word.characterIds.some((id) => id.startsWith('katakana-') && CHAR_SPECIAL_IDS.has(id)) ? 'special-katakana' : 'youon'
}

const CHAR_SPECIAL_IDS = new Set(['katakana-fa', 'katakana-fi', 'katakana-fe', 'katakana-fo', 'katakana-ti', 'katakana-di', 'katakana-she', 'katakana-je', 'katakana-che', 'katakana-wi', 'katakana-we', 'katakana-special-wo'])

export function buildYouonSpecialAssessmentPlan({ characterIds, words, rng }: BuildAssessmentPlanInput): AssessmentPlan {
  const youonChars = characterIds.filter((id) => !CHAR_SPECIAL_IDS.has(id))
  const specialChars = characterIds.filter((id) => CHAR_SPECIAL_IDS.has(id))
  const youonWords = words.filter((word) => domainOf(word) === 'youon')
  const specialWords = words.filter((word) => domainOf(word) === 'special-katakana')
  const blocks = {} as Record<AssessmentFamily, AssessmentQuestion[]>
  const yPool = shuffleWithRng(youonWords, rng)
  const sPool = shuffleWithRng(specialWords, rng)
  let yCursor = 0
  let sCursor = 0
  for (const family of ['listening', 'word-builder', 'word-reading'] as const) {
    const selected: AnchorWord[] = []
    for (let i = 0; i < 4; i++) selected.push(yPool[yCursor++ % yPool.length])
    selected.push(sPool[sCursor++ % sPool.length])
    blocks[family] = shuffleWithRng(selected, rng).map((word) => ({ family, word, direction: family === 'word-reading' ? 'kana-to-sound' : 'sound-to-kana', domain: domainOf(word) }))
  }
  const kanaTargets = [...takeWithFallback(shuffleWithRng(youonChars, rng), 4), ...takeWithFallback(shuffleWithRng(specialChars, rng), 1)]
  blocks['kana-quiz'] = shuffleWithRng(kanaTargets, rng).map((characterId, i) => ({ family: 'kana-quiz', characterId, kanaQuizDirection: i % 2 === 0 ? 'read' : 'recall', direction: i % 2 === 0 ? 'kana-to-sound' : 'sound-to-kana', domain: CHAR_SPECIAL_IDS.has(characterId) ? 'special-katakana' : 'youon' }))
  return { questions: interleave(blocks, rng) }
}

export type FinalAssessmentDomain = 'basic-hiragana' | 'basic-katakana' | 'dakuon-handakuon' | 'sokuon' | 'long-vowel' | 'youon' | 'special-katakana'

const FINAL_DOMAIN_ORDER: FinalAssessmentDomain[] = ['basic-hiragana', 'basic-katakana', 'dakuon-handakuon', 'sokuon', 'long-vowel', 'youon', 'special-katakana']

export function finalAssessmentDomains(word: AnchorWord): FinalAssessmentDomain[] {
  const rows = word.characterIds.map((id) => CHARACTERS_BY_ID_FOR_PLAN[id]?.rowId ?? '')
  const ids = word.characterIds
  const domains = new Set<FinalAssessmentDomain>()
  if (rows.some((row) => row.startsWith('youon-'))) domains.add('youon')
  if (rows.some((row) => row.startsWith('special-katakana-'))) domains.add('special-katakana')
  if (rows.some((row) => row === 'sokuon-row') || ids.includes('sokuon') || ids.includes('katakana-sokuon')) domains.add('sokuon')
  if (rows.some((row) => row.startsWith('chouon-')) || ids.includes('katakana-chouon')) domains.add('long-vowel')
  if (ids.some((id) => CHARACTERS_BY_ID_FOR_PLAN[id]?.type === 'dakuten' || CHARACTERS_BY_ID_FOR_PLAN[id]?.type === 'handakuten')) domains.add('dakuon-handakuon')
  if (ids.some((id) => id.startsWith('katakana-'))) domains.add('basic-katakana')
  else domains.add('basic-hiragana')
  return [...domains]
}

// Kept local to avoid making the plan depend on React/UI modules.
import { CHARACTERS_BY_ID as CHARACTERS_BY_ID_FOR_PLAN } from '../data/characters'

export function buildFinalAssessmentPlan({ characterIds, words, rng }: BuildAssessmentPlanInput): AssessmentPlan {
  const shuffledWords = shuffleWithRng(words, rng)
  const selected: AnchorWord[] = []
  const used = new Set<string>()
  for (const domain of FINAL_DOMAIN_ORDER) {
    const candidate = shuffledWords.find((word) => !used.has(word.id) && finalAssessmentDomains(word).includes(domain))
    if (candidate) { selected.push(candidate); used.add(candidate.id) }
  }
  for (const word of shuffledWords) {
    if (selected.length >= 24) break
    if (!used.has(word.id)) { selected.push(word); used.add(word.id) }
  }
  const pool = selected.length >= 24 ? selected : takeWithFallback(shuffledWords, 24)
  const familyTargets = { listening: 8, 'word-builder': 8, 'word-reading': 8 } as const
  const blocks = {} as Record<AssessmentFamily, AssessmentQuestion[]>
  let cursor = 0
  for (const [family, count] of Object.entries(familyTargets) as [AssessmentFamily, number][]) {
    blocks[family] = Array.from({ length: count }, () => {
      const index = cursor++
      const word = pool[index % pool.length]
      const preferred = FINAL_DOMAIN_ORDER[index % FINAL_DOMAIN_ORDER.length]
      return { family, word, direction: family === 'word-reading' ? 'kana-to-sound' : 'sound-to-kana', domain: finalAssessmentDomains(word).includes(preferred) ? preferred : finalAssessmentDomains(word)[0] }
    })
  }
  const kanaIds = shuffleWithRng(characterIds, rng)
  blocks['kana-quiz'] = Array.from({ length: 6 }, (_, i) => {
    const characterId = kanaIds[i % kanaIds.length]
    return { family: 'kana-quiz', characterId, kanaQuizDirection: i % 2 === 0 ? 'read' : 'recall', direction: i % 2 === 0 ? 'kana-to-sound' : 'sound-to-kana', domain: undefined }
  })
  return { questions: interleaveFinal(blocks, rng) }
}

function interleaveFinal(blocks: Record<AssessmentFamily, AssessmentQuestion[]>, rng: () => number): AssessmentQuestion[] {
  const remaining = Object.fromEntries(Object.entries(blocks).map(([key, value]) => [key, [...value]])) as Record<AssessmentFamily, AssessmentQuestion[]>
  const result: AssessmentQuestion[] = []
  let lastFamily: AssessmentFamily | null = null
  let run = 0
  while (result.length < 30) {
    const choices = shuffleWithRng((Object.keys(remaining) as AssessmentFamily[]).filter((family) => remaining[family].length && !(family === lastFamily && run >= 2)), rng)
    const family = choices[0] ?? (Object.keys(remaining) as AssessmentFamily[]).find((key) => remaining[key].length)
    if (!family) break
    result.push(remaining[family].shift()!)
    run = family === lastFamily ? run + 1 : 1
    lastFamily = family
  }
  return result
}
