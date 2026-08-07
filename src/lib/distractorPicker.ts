import { getConfusableIds } from '../data/distractors'
import type { AnchorWord } from '../data/types'
import { shuffle } from './shuffle'

// Picks distractor CHARACTER ids for the word-builder tray: prefers ids
// that are visually/phonetically confusable with one of the target word's
// characters, falling back to any other unlocked character when the
// confusable pool is too small (common in early rows).
export function pickDistractorCharIds(targetCharIds: string[], pool: string[], count: number): string[] {
  const targetSet = new Set(targetCharIds)
  const confusable = [...new Set(targetCharIds.flatMap((id) => getConfusableIds(id)))].filter(
    (id) => pool.includes(id) && !targetSet.has(id),
  )
  const rest = pool.filter((id) => !targetSet.has(id) && !confusable.includes(id))
  return shuffle(confusable).concat(shuffle(rest)).slice(0, count)
}

// Picks distractor WORDS for the listening game: prefers words containing
// at least one character confusable with a character in the target word,
// falling back to any other unlocked word.
export function pickDistractorWords(target: AnchorWord, candidates: AnchorWord[], count: number): AnchorWord[] {
  const others = candidates.filter((w) => w.id !== target.id)
  const isConfusable = (w: AnchorWord) =>
    w.characterIds.some((cid) => target.characterIds.some((tid) => getConfusableIds(tid).includes(cid)))

  const preferred = shuffle(others.filter(isConfusable))
  const rest = shuffle(others.filter((w) => !isConfusable(w)))
  return [...preferred, ...rest].slice(0, count)
}
