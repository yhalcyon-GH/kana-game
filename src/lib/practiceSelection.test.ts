import { describe, expect, it } from 'vitest'
import { buildWeightedQueue } from './practiceSelection'

describe('buildWeightedQueue', () => {
  it('samples a box-0 id more often than a box-4 id over many trials', () => {
    // A realistic row has several characters; with only 2 ids the
    // no-consecutive-repeat rule would force ~50/50 alternation regardless
    // of weight, so this uses a pool size representative of an actual row.
    const ids = ['weak', 'strong-a', 'strong-b', 'strong-c']
    const boxes: Record<string, number> = { weak: 0, 'strong-a': 4, 'strong-b': 4, 'strong-c': 4 }
    const queue = buildWeightedQueue(ids, (id) => boxes[id], 4000)
    const weakCount = queue.filter((id) => id === 'weak').length
    const avgStrongCount = queue.filter((id) => id.startsWith('strong')).length / 3
    // The no-consecutive-repeat rule dampens pure weight-driven skew (a
    // weak pick forces a strong pick next round), so the achieved ratio is
    // well under the raw 10:0.5 weight ratio — assert a conservative bound.
    expect(weakCount).toBeGreaterThan(avgStrongCount * 2)
  })

  it('never repeats the same id on consecutive rounds when more than one id exists', () => {
    const ids = ['a', 'b', 'c']
    const queue = buildWeightedQueue(ids, () => 0, 200)
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i]).not.toBe(queue[i - 1])
    }
  })

  it('returns an empty queue for an empty id list', () => {
    expect(buildWeightedQueue([], () => 0, 5)).toEqual([])
  })
})
