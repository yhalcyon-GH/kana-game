import { describe, expect, it, vi } from 'vitest'
import { buildWeightedQueue } from './practiceSelection'

describe('buildWeightedQueue', () => {
  it('never repeats an id when there are at least as many ids as rounds', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const queue = buildWeightedQueue(ids, () => 0, 8)
    expect(new Set(queue).size).toBe(8)
    expect(queue.sort()).toEqual([...ids].sort())
  })

  it('minimizes repeats when there are fewer ids than rounds: every id appears at least once before any appears twice', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const queue = buildWeightedQueue(ids, () => 0, 8)
    expect(queue).toHaveLength(8)
    const counts = new Map<string, number>()
    for (const id of queue) counts.set(id, (counts.get(id) ?? 0) + 1)
    expect(counts.size).toBe(6)
    // 8 rounds over 6 ids: everyone gets 1, and exactly 2 ids get a 2nd.
    const values = [...counts.values()].sort()
    expect(values).toEqual([1, 1, 1, 1, 2, 2])
  })

  it('gives a box-0 id the extra repeat slots more often than box-4 ids over many sessions', () => {
    // 3 ids over 8 rounds: base = floor(8/3) = 2 guaranteed reps each, plus
    // 2 leftover "extra" slots per session handed out by weight.
    const ids = ['weak', 'strong-a', 'strong-b']
    const boxes: Record<string, number> = { weak: 0, 'strong-a': 4, 'strong-b': 4 }
    let weakExtraCount = 0
    let strongExtraCount = 0
    for (let i = 0; i < 500; i++) {
      const queue = buildWeightedQueue(ids, (id) => boxes[id], 8)
      const counts = new Map<string, number>()
      for (const id of queue) counts.set(id, (counts.get(id) ?? 0) + 1)
      weakExtraCount += (counts.get('weak') ?? 0) - 2
      strongExtraCount += (counts.get('strong-a') ?? 0) - 2 + (counts.get('strong-b') ?? 0) - 2
    }
    // weak (weight 10) should soak up noticeably more of the extra slots
    // than the strong ids' (weight 0.5 each) per-id average.
    expect(weakExtraCount).toBeGreaterThan(strongExtraCount / 2)
  })

  it('never repeats the same id on consecutive rounds when more than one id exists', () => {
    const ids = ['a', 'b', 'c']
    const queue = buildWeightedQueue(ids, () => 0, 200)
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i]).not.toBe(queue[i - 1])
    }
  })

  it('honors a preceding queue item when selecting an additional block', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(buildWeightedQueue(['a', 'b'], () => 0, 1, 'a')).toEqual(['b'])
    vi.restoreAllMocks()
  })

  it('returns an empty queue for an empty id list', () => {
    expect(buildWeightedQueue([], () => 0, 5)).toEqual([])
  })
})
