import { describe, expect, it } from 'vitest'
import { isKatakanaOnlyDish } from '../data/restaurantDishes'
import { getCheckpointDishPool } from './checkpointDishPool'
import { MAX_TARGET_USES_PER_SESSION, pickSessionTargets, type TargetUseCounts } from './targetSchedule'

// A simple deterministic LCG so tests exercise many distinct sequences
// without depending on Math.random (see restaurantRound.test.ts's makeRng).
function makeRng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

// Simulates one full 8-question Restaurant/Cafe session's target scheduling
// (Q1-4: 1 target, Q5-8: 2 targets — 12 target slots total) the same way
// useOrderingGame.ts does, and returns every question's chosen target ids.
function simulateSession(pool: ReturnType<typeof getCheckpointDishPool>['targets'], rng: () => number): string[][] {
  const counts: TargetUseCounts = new Map()
  const questions: string[][] = []
  let previous: string[] = []
  for (let question = 1; question <= 8; question++) {
    const count = question >= 5 ? 2 : 1
    const picked = pickSessionTargets(pool, count, counts, rng, new Set(previous))
    questions.push(picked.map((d) => d.id))
    previous = picked.map((d) => d.id)
  }
  return questions
}

describe('pickSessionTargets', () => {
  const pool = getCheckpointDishPool('na-row').targets // 11 dishes

  it('never exceeds the per-dish session-use cap across many seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const counts: TargetUseCounts = new Map()
      const rng = makeRng(seed)
      for (let question = 1; question <= 8; question++) {
        pickSessionTargets(pool, question >= 5 ? 2 : 1, counts, rng)
      }
      for (const [, count] of counts) expect(count).toBeLessThanOrEqual(MAX_TARGET_USES_PER_SESSION)
    }
  })

  it('never picks the same dish twice within one two-target question', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const counts: TargetUseCounts = new Map()
      const picked = pickSessionTargets(pool, 2, counts, makeRng(seed))
      expect(picked[0].id).not.toBe(picked[1].id)
    }
  })

  it('prefers the lowest-use-count dish, distributing use fairly across many picks', () => {
    const counts: TargetUseCounts = new Map()
    const rng = makeRng(7)
    for (let i = 0; i < 20; i++) pickSessionTargets(pool, 1, counts, rng)
    const values = [...counts.values()]
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
  })

  it('throws rather than silently violating the cap when the pool is too small', () => {
    const tiny = pool.slice(0, 2)
    const counts: TargetUseCounts = new Map()
    pickSessionTargets(tiny, 2, counts, makeRng(1)) // uses both dishes once each
    pickSessionTargets(tiny, 2, counts, makeRng(2)) // uses both dishes twice each — now exhausted
    expect(() => pickSessionTargets(tiny, 1, counts, makeRng(3))).toThrow()
  })

  it('falls back to the lowest-count pool as a whole once every such dish is in `avoid`', () => {
    const counts: TargetUseCounts = new Map()
    const avoid = new Set(pool.map((d) => d.id))
    const picked = pickSessionTargets(pool, 1, counts, makeRng(1), avoid)
    expect(picked).toHaveLength(1)
  })

  // Issue #166's required simulated-session tests, run across every
  // checkpoint's real cumulative target pool — proves the cumulative-pool
  // fix (lib/checkpointDishPool.ts) actually supplies enough same-mode
  // vocabulary to satisfy the cap everywhere, not just in isolation.
  describe('simulated 8-question sessions over every checkpoint\'s real target pool', () => {
    const checkpointCases = [
      { checkpointId: 'na-row' },
      { checkpointId: 'hiragana-complete' },
      { checkpointId: 'katakana-sa-row' },
      { checkpointId: 'katakana-ha-row', cafe: true },
      { checkpointId: 'katakana-complete' },
      { checkpointId: 'sokuon-complete', cafe: true },
      { checkpointId: 'chouon-complete' },
      { checkpointId: 'hiragana-youon-complete' },
      { checkpointId: 'katakana-youon-complete' },
      { checkpointId: 'special-katakana-complete', cafe: true },
    ]

    it.each(checkpointCases)('checkpoint "$checkpointId": no dish is targeted more than twice, and no two-target question repeats a dish', ({ checkpointId, cafe }) => {
      const { targets } = getCheckpointDishPool(checkpointId, cafe ? isKatakanaOnlyDish : undefined)
      for (let seed = 1; seed <= 10; seed++) {
        const questions = simulateSession(targets, makeRng(seed))
        expect(questions).toHaveLength(8)
        const tally = new Map<string, number>()
        for (const [index, ids] of questions.entries()) {
          expect(ids, `question ${index + 1} should have ${index >= 4 ? 2 : 1} target(s)`).toHaveLength(index >= 4 ? 2 : 1)
          expect(new Set(ids).size, `question ${index + 1} repeats a dish within itself`).toBe(ids.length)
          for (const id of ids) tally.set(id, (tally.get(id) ?? 0) + 1)
        }
        for (const [id, count] of tally) {
          expect(count, `"${id}" was targeted ${count} times in one session (checkpoint "${checkpointId}")`).toBeLessThanOrEqual(MAX_TARGET_USES_PER_SESSION)
        }
      }
    })
  })
})
