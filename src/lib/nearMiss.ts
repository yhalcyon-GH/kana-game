import { HIRAGANA_SIMILAR_GROUPS, KATAKANA_SIMILAR_GROUPS } from '../data/similarLetters'
import type { AnchorWord } from '../data/types'
import { normalizeKana } from './answerChecking'

// "Near miss" wrong-answer detection, shared by every graded mini-game — see
// data/feedback.ts's WRONG_OSHII ("惜しい！", near-miss only) vs
// WRONG_GANBARE/WRONG_DAIJOUBU (any other wrong answer). Every check here is
// deliberately conservative: when a wrong answer's closeness to the correct
// one isn't clearly established by one of these rules, it's NOT a near miss
// — see lib/feedbackVoice.ts's pickIncorrectFeedback.

// Same hand-curated shape-confusion groups Similar Letters mode uses (see
// data/similarLetters.ts) — reused here as the conservative definition of
// "visually confusable" for Kana Quiz/Listening's multiple-choice near-miss
// check. A wrong choice outside these groups (e.g. a random unrelated
// character) is never a near miss, no matter how "close" it might otherwise
// seem.
const CONFUSION_GROUPS = [...HIRAGANA_SIMILAR_GROUPS, ...KATAKANA_SIMILAR_GROUPS]

// Kana Quiz: was the wrong choice a visually-confusable character for the
// correct one (same curated shape-confusion group)?
export function isNearMissCharacterChoice(correctId: string, chosenId: string): boolean {
  if (correctId === chosenId) return false
  return CONFUSION_GROUPS.some((group) => group.includes(correctId) && group.includes(chosenId))
}

// Listening: was the wrong word choice close to the correct word — same
// character count, differing in exactly ONE character position, and that
// one differing character pair is itself a shape-confusable pair? A
// same-length word differing by an unrelated character (or by more than
// one) is not a near miss.
export function isNearMissWordChoice(correct: Pick<AnchorWord, 'id' | 'characterIds'>, chosen: Pick<AnchorWord, 'id' | 'characterIds'>): boolean {
  if (correct.id === chosen.id) return false
  if (correct.characterIds.length !== chosen.characterIds.length) return false
  const diffIndexes = correct.characterIds.reduce<number[]>((acc, id, i) => {
    if (id !== chosen.characterIds[i]) acc.push(i)
    return acc
  }, [])
  if (diffIndexes.length !== 1) return false
  const [i] = diffIndexes
  return isNearMissCharacterChoice(correct.characterIds[i], chosen.characterIds[i])
}

// Word Builder: was exactly one learning-unit tile wrong out of a
// multi-unit word? A single-unit word getting its only tile wrong is just
// wrong, not a near miss — there's no "close" version of getting the one
// tile right.
export function isNearMissWordBuilder(wrongUnitCount: number, totalUnitCount: number): boolean {
  return totalUnitCount >= 2 && wrongUnitCount === 1
}

// Kana Typing: was the typed text exactly ONE character off (insertion,
// deletion, or substitution) from the target kana? Uses a plain Levenshtein
// distance over normalized kana — deliberately not "close by romaji" or any
// looser fuzzy match, since a distance-1 kana typo is the one case that's
// unambiguously "so close." An empty input is never a near miss.
function levenshteinDistance(a: string, b: string): number {
  const aChars = [...a]
  const bChars = [...b]
  const rows = aChars.length + 1
  const cols = bChars.length + 1
  const d: number[][] = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)])
  for (let j = 0; j < cols; j++) d[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = aChars[i - 1] === bChars[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    }
  }
  return d[rows - 1][cols - 1]
}

export function isNearMissTypedKana(input: string, targetKana: string): boolean {
  const normalizedInput = normalizeKana(input)
  if (normalizedInput === '') return false
  return levenshteinDistance(normalizedInput, normalizeKana(targetKana)) === 1
}
