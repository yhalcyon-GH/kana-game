import { weightForBox } from './srs'

export type BoxLookup = (id: string) => number

// Weighted sampling WITHOUT replacement: draws up to `count` distinct ids
// from `ids`, favoring low-box (weak) ids on each draw.
function weightedSampleWithoutReplacement(ids: string[], getBox: BoxLookup, count: number): string[] {
  const pool = [...ids]
  const picked: string[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const weights = pool.map((id) => weightForBox(getBox(id)))
    const total = weights.reduce((sum, w) => sum + w, 0)
    let r = Math.random() * total
    let index = pool.length - 1
    for (let j = 0; j < pool.length; j++) {
      r -= weights[j]
      if (r <= 0) {
        index = j
        break
      }
    }
    picked.push(pool[index])
    pool.splice(index, 1)
  }
  return picked
}

// Reorders `items` (which may contain repeats) so identical ids never sit
// next to each other, whenever that's mathematically possible — greedily
// placing whichever remaining id has the highest remaining count (breaking
// ties randomly) that isn't the id just placed.
function arrangeNoConsecutiveRepeats(items: string[], precedingId?: string): string[] {
  const remaining = new Map<string, number>()
  for (const item of items) remaining.set(item, (remaining.get(item) ?? 0) + 1)

  const result: string[] = []
  let last: string | null = precedingId ?? null
  for (let i = 0; i < items.length; i++) {
    let candidates = [...remaining.entries()].filter(([id, c]) => c > 0 && id !== last)
    if (candidates.length === 0) {
      candidates = [...remaining.entries()].filter(([, c]) => c > 0)
    }
    const maxCount = Math.max(...candidates.map(([, c]) => c))
    const topCandidates = candidates.filter(([, c]) => c === maxCount)
    const [id] = topCandidates[Math.floor(Math.random() * topCandidates.length)]
    result.push(id)
    remaining.set(id, (remaining.get(id) ?? 1) - 1)
    last = id
  }
  return result
}

// Builds a `count`-round session queue, favoring low-box (weak) ids for
// selection/extra reps, while minimizing repeats:
// - When there are at least `count` distinct ids, every id in the queue is
//   unique (weighted sampling without replacement picks which ones).
// - When there are fewer ids than `count`, repeats are unavoidable: every id
//   gets an equal base number of appearances first, and only the leftover
//   rounds (as few as possible) go to extra, weighted-toward-weak picks.
// Consecutive rounds never repeat the same id when more than one id exists.
export function buildWeightedQueue(ids: string[], getBox: BoxLookup, count: number, precedingId?: string): string[] {
  if (ids.length === 0) return []

  let picks: string[]
  if (ids.length >= count) {
    // A one-off follow-on block can choose a different first item directly.
    // When the block needs every id, keep the whole pool and let the
    // arrangement step preserve coverage while selecting its first item.
    const sampleIds = precedingId && ids.length > 1 && count < ids.length
      ? ids.filter((id) => id !== precedingId)
      : ids
    picks = weightedSampleWithoutReplacement(sampleIds, getBox, count)
  } else {
    const base = Math.floor(count / ids.length)
    const remainder = count - base * ids.length
    picks = []
    for (let i = 0; i < base; i++) picks.push(...ids)
    picks.push(...weightedSampleWithoutReplacement(ids, getBox, remainder))
  }

  return arrangeNoConsecutiveRepeats(picks, precedingId)
}
