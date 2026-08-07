import { weightForBox } from './srs'

export type BoxLookup = (id: string) => number

function weightedPickIndex(ids: string[], getBox: BoxLookup): number {
  const weights = ids.map((id) => weightForBox(getBox(id)))
  const total = weights.reduce((sum, w) => sum + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < ids.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return ids.length - 1
}

// Builds a `count`-round session queue by weighted random sampling WITH
// replacement (low-box ids are drawn more often), while avoiding picking
// the same id on back-to-back rounds where more than one option exists.
export function buildWeightedQueue(
  ids: string[],
  getBox: BoxLookup,
  count: number,
): string[] {
  if (ids.length === 0) return []
  const queue: string[] = []
  let last: string | null = null
  for (let i = 0; i < count; i++) {
    const candidates: string[] = ids.length > 1 && last !== null ? ids.filter((id) => id !== last) : ids
    const pick: string = candidates[weightedPickIndex(candidates, getBox)]
    queue.push(pick)
    last = pick
  }
  return queue
}
