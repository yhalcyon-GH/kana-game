import { describe, expect, it } from 'vitest'
import {
  buildGroupBalancedPicks,
  buildSimilarLettersTargetQueue,
  buildSimilarLettersWordQueue,
  getGroupMates,
  pickSimilarLettersDistractorCharIds,
  pickSimilarLettersDistractorWords,
  type Rng,
} from './similarLettersSelection'

// Deterministic PRNG (mulberry32) so every test below asserts an exact,
// reproducible sequence instead of relying on statistical fuzziness — see
// the Issue's "seeded RNG / injected RNG / deterministic sampler" rule.
function seededRng(seed: number): Rng {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GROUPS = [
  ['shi', 'tsu'],
  ['su', 'nu'],
  ['ko', 'yu'],
]

describe('buildGroupBalancedPicks', () => {
  it('cycles every group before repeating any group, across multiple full cycles', () => {
    const rng = seededRng(1)
    const picks = buildGroupBalancedPicks(GROUPS, 30, rng)
    // Every pick must belong to one of the known groups.
    const known = new Set(GROUPS.flat())
    for (const p of picks) expect(known.has(p)).toBe(true)

    // Split into chunks of 3 (one full cycle each, since there are 3
    // groups) and verify each chunk touches all 3 groups at least once —
    // "no group can dominate or go missing within a cycle."
    for (let i = 0; i < picks.length; i += 3) {
      const chunk = picks.slice(i, i + 3)
      if (chunk.length < 3) continue
      const groupsTouched = new Set(chunk.map((c) => GROUPS.findIndex((g) => g.includes(c))))
      expect(groupsTouched.size, `cycle starting at index ${i}`).toBe(3)
    }
  })

  it('is reproducible for the same seed (deterministic, not flaky)', () => {
    const picksA = buildGroupBalancedPicks(GROUPS, 12, seededRng(42))
    const picksB = buildGroupBalancedPicks(GROUPS, 12, seededRng(42))
    expect(picksA).toEqual(picksB)
  })

  it('skips empty groups entirely', () => {
    const withEmpty = [['a'], [], ['b']]
    const picks = buildGroupBalancedPicks(withEmpty, 20, seededRng(7))
    expect(picks.every((p) => p === 'a' || p === 'b')).toBe(true)
  })

  it('avoids an immediate repeat of the same character when the group offers an alternative', () => {
    const rng = seededRng(3)
    const picks = buildGroupBalancedPicks([['x', 'y']], 50, rng)
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i], `index ${i}`).not.toBe(picks[i - 1])
    }
  })
})

describe('buildSimilarLettersTargetQueue', () => {
  it('is approximately 80% group members / 20% normal pool over a large sample', () => {
    const normalPool = ['normal-1', 'normal-2', 'normal-3']
    const queue = buildSimilarLettersTargetQueue(GROUPS, normalPool, 200, seededRng(11))
    const groupIds = new Set(GROUPS.flat())
    const similarCount = queue.filter((id) => groupIds.has(id)).length
    const ratio = similarCount / queue.length
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(0.9)
  })

  it('every confusion group appears somewhere in a reasonably long queue (no group starved)', () => {
    const queue = buildSimilarLettersTargetQueue(GROUPS, ['normal-1'], 60, seededRng(5))
    for (const group of GROUPS) {
      expect(group.some((id) => queue.includes(id)), `group ${group.join('/')}`).toBe(true)
    }
  })

  it('has no immediate repeats', () => {
    const queue = buildSimilarLettersTargetQueue(GROUPS, ['normal-1', 'normal-2'], 40, seededRng(9))
    for (let i = 1; i < queue.length; i++) expect(queue[i]).not.toBe(queue[i - 1])
  })

  it('is deterministic for a given seed', () => {
    const a = buildSimilarLettersTargetQueue(GROUPS, ['normal-1'], 15, seededRng(99))
    const b = buildSimilarLettersTargetQueue(GROUPS, ['normal-1'], 15, seededRng(99))
    expect(a).toEqual(b)
  })
})

describe('buildSimilarLettersWordQueue', () => {
  type W = { id: string; characterIds: string[] }
  const targetWords: W[] = [
    { id: 'w-shi', characterIds: ['shi'] },
    { id: 'w-tsu', characterIds: ['tsu'] },
    { id: 'w-su', characterIds: ['su'] },
  ]
  const normalWords: W[] = [{ id: 'w-normal-1', characterIds: ['x'] }]

  it('is approximately 80/20 target/normal', () => {
    const queue = buildSimilarLettersWordQueue(GROUPS, targetWords, normalWords, 200, seededRng(2))
    const targetIds = new Set(targetWords.map((w) => w.id))
    const ratio = queue.filter((id) => targetIds.has(id)).length / queue.length
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(0.9)
  })

  it('falls back gracefully when a group has no matching words at all', () => {
    const queue = buildSimilarLettersWordQueue(GROUPS, targetWords, normalWords, 20, seededRng(4))
    expect(queue.length).toBeGreaterThan(0)
  })
})

describe('getGroupMates', () => {
  it('returns every OTHER member of the same group', () => {
    expect(getGroupMates(GROUPS, 'shi')).toEqual(['tsu'])
    expect(getGroupMates(GROUPS, 'ko')).toEqual(['yu'])
  })

  it('returns an empty array for an id not in any group', () => {
    expect(getGroupMates(GROUPS, 'unrelated')).toEqual([])
  })
})

describe('pickSimilarLettersDistractorCharIds', () => {
  it('always includes at least one same-group mate when one is available in the pool', () => {
    const pool = ['shi', 'tsu', 'su', 'nu', 'ko', 'yu']
    for (let seed = 0; seed < 20; seed++) {
      const distractors = pickSimilarLettersDistractorCharIds(['shi'], GROUPS, pool, 3, seededRng(seed))
      expect(distractors, `seed ${seed}`).toContain('tsu')
    }
  })

  it('never includes the target itself', () => {
    const pool = ['shi', 'tsu', 'su', 'nu']
    const distractors = pickSimilarLettersDistractorCharIds(['shi'], GROUPS, pool, 3, seededRng(1))
    expect(distractors).not.toContain('shi')
  })
})

describe('pickSimilarLettersDistractorWords', () => {
  type W = { id: string; characterIds: string[] }
  const target: W = { id: 'w-shi', characterIds: ['shi'] }
  const candidates: W[] = [
    { id: 'w-tsu', characterIds: ['tsu'] },
    { id: 'w-su', characterIds: ['su'] },
    { id: 'w-other', characterIds: ['unrelated'] },
  ]

  it('prefers a candidate word containing a same-group character', () => {
    for (let seed = 0; seed < 20; seed++) {
      const [first] = pickSimilarLettersDistractorWords(target, GROUPS, candidates, 1, seededRng(seed))
      expect(first.id, `seed ${seed}`).toBe('w-tsu')
    }
  })
})
