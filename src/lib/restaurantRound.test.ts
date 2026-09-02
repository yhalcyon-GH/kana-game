import { describe, expect, it } from 'vitest'
import { PRACTICE_CHECKPOINTS } from '../data/practiceCheckpoints'
import { HIRAGANA_RESTAURANT_DISHES, KATAKANA_RESTAURANT_DISHES, isKatakanaOnlyDish, type RestaurantDish } from '../data/restaurantDishes'
import { getCheckpointDishPool } from './checkpointDishPool'
import { MAX_TARGET_USES_PER_SESSION, pickCappedTarget, pickRound, pickRoundFromPools, shuffleRestaurantChoices } from './restaurantRound'

// Simple deterministic LCG so tests don't depend on Math.random while still
// exercising many distinct sequences.
function makeRng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

describe('pickRound', () => {
  it('returns 4 unique dishes, and a target that is one of them, across many seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { menu, target } = pickRound(HIRAGANA_RESTAURANT_DISHES, makeRng(seed + 1))
      expect(menu).toHaveLength(4)
      expect(new Set(menu.map((d) => d.id)).size).toBe(4)
      expect(menu.some((d) => d.id === target.id)).toBe(true)
    }
  })

  it('is deterministic given the same injected rng sequence', () => {
    const seq = [0.1, 0.9, 0.2, 0.8, 0.05, 0.5]
    let i = 0
    const rng = () => seq[i++]
    const a = pickRound(HIRAGANA_RESTAURANT_DISHES, rng)
    i = 0
    const b = pickRound(HIRAGANA_RESTAURANT_DISHES, rng)
    expect(a.menu.map((d) => d.id)).toEqual(b.menu.map((d) => d.id))
    expect(a.target.id).toBe(b.target.id)
  })

  it('throws if given fewer than 4 dishes', () => {
    expect(() => pickRound(HIRAGANA_RESTAURANT_DISHES.slice(0, 2), Math.random)).toThrow()
  })

  it('handles an rng that returns exactly 1 without going out of bounds', () => {
    const { menu, target } = pickRound(HIRAGANA_RESTAURANT_DISHES, () => 1)
    expect(menu).toHaveLength(4)
    expect(target).toBeDefined()
  })

  it('avoids repeating the previous target when another menu item is available', () => {
    const first = pickRound(HIRAGANA_RESTAURANT_DISHES, () => 0)
    const next = pickRound(HIRAGANA_RESTAURANT_DISHES, () => 0, first.target.id)
    expect(next.target.id).not.toBe(first.target.id)
  })
})

describe('shuffleRestaurantChoices', () => {
  it('returns the same four dishes in an order independent from the menu order', () => {
    const menu = HIRAGANA_RESTAURANT_DISHES.slice(0, 4)
    const shuffled = shuffleRestaurantChoices(menu, () => 0)
    expect(shuffled.map((dish) => dish.id)).toEqual(['udon', 'tonkatsu', 'katsudon', 'sushi'])
    expect(new Set(shuffled.map((dish) => dish.id))).toEqual(new Set(menu.map((dish) => dish.id)))
  })
})

describe('pickRoundFromPools', () => {
  it('keeps targets in the current stage while allowing earlier-stage menu dishes', () => {
    const round = pickRoundFromPools(KATAKANA_RESTAURANT_DISHES, [...HIRAGANA_RESTAURANT_DISHES, ...KATAKANA_RESTAURANT_DISHES], () => 0)
    expect(round.target.stage).toBe('katakana')
    expect(round.menu).toHaveLength(4)
    expect(round.menu.some((dish) => dish.stage === 'hiragana')).toBe(true)
  })

  it('does not pin the target to the first menu position', () => {
    const positions = new Set<number>()
    for (let seed = 1; seed <= 40; seed++) {
      const round = pickRoundFromPools(HIRAGANA_RESTAURANT_DISHES, HIRAGANA_RESTAURANT_DISHES, makeRng(seed))
      positions.add(round.menu.findIndex((dish) => dish.id === round.target.id))
    }
    expect(positions.size).toBeGreaterThan(1)
  })
})

// Issue #166: a dish may be asked as a question target at most
// MAX_TARGET_USES_PER_SESSION (2) times across one 8-question session.
describe('pickCappedTarget', () => {
  it('never returns a dish already at the use cap while an under-cap alternative exists', () => {
    const pool = KATAKANA_RESTAURANT_DISHES.slice(0, 4)
    const usedTargetIds = [pool[0].id, pool[0].id, pool[1].id]
    for (let seed = 0; seed < 50; seed++) {
      const picked = pickCappedTarget(pool, usedTargetIds, [], [], makeRng(seed))
      expect(picked.id).not.toBe(pool[0].id)
    }
  })

  it('excludes the given id even when it is the least-used dish', () => {
    for (let seed = 0; seed < 20; seed++) {
      const picked = pickCappedTarget(KATAKANA_RESTAURANT_DISHES, [], [KATAKANA_RESTAURANT_DISHES[0].id], [], makeRng(seed))
      expect(picked.id).not.toBe(KATAKANA_RESTAURANT_DISHES[0].id)
    }
  })

  it('prefers the lowest use count among eligible dishes', () => {
    const pool = KATAKANA_RESTAURANT_DISHES.slice(0, 3)
    const usedTargetIds = [pool[0].id, pool[1].id]
    for (let seed = 0; seed < 50; seed++) {
      const picked = pickCappedTarget(pool, usedTargetIds, [], [], makeRng(seed))
      expect(picked.id).toBe(pool[2].id)
    }
  })

  it('falls back gracefully instead of throwing when every candidate is already at the cap', () => {
    const pool = KATAKANA_RESTAURANT_DISHES.slice(0, 2)
    const usedTargetIds = [pool[0].id, pool[0].id, pool[1].id, pool[1].id]
    expect(() => pickCappedTarget(pool, usedTargetIds, [], [], () => 0)).not.toThrow()
  })
})

// Issue #166: mechanically simulates a full 8-question session exactly the
// way useOrderingGame.ts's nextOrder() drives target selection (single
// target for Q1-4, a first + second target for Q5-8, always excluding the
// question's own first target from its second, and carrying the previous
// question's target forward as the next question's soft-avoid/hard-exclude
// id) — using each checkpoint's REAL target pool, so this proves the cap
// actually holds with the current cumulative data, not just in the
// abstract.
function simulateSession(dishes: RestaurantDish[], rng: () => number) {
  const usedTargetIds: string[] = []
  const usedPairKeys: string[] = []
  const twoTargetQuestions: [RestaurantDish, RestaurantDish][] = []
  let previousTargetId: string | undefined
  for (let questionNumber = 1; questionNumber <= 8; questionNumber++) {
    const first = pickCappedTarget(dishes, usedTargetIds, previousTargetId ? [previousTargetId] : [], [], rng)
    usedTargetIds.push(first.id)
    if (questionNumber >= 5) {
      const pairAvoidIds = dishes.filter((d) => usedPairKeys.includes([first.id, d.id].sort().join('|'))).map((d) => d.id)
      const second = pickCappedTarget(dishes, usedTargetIds, [first.id], pairAvoidIds, rng)
      usedTargetIds.push(second.id)
      usedPairKeys.push([first.id, second.id].sort().join('|'))
      twoTargetQuestions.push([first, second])
    }
    previousTargetId = first.id
  }
  const targetCounts: Record<string, number> = {}
  for (const id of usedTargetIds) targetCounts[id] = (targetCounts[id] ?? 0) + 1
  return { usedTargetIds, targetCounts, twoTargetQuestions }
}

describe('simulated 8-question session — session-wide target cap and pair uniqueness', () => {
  it.each(PRACTICE_CHECKPOINTS)('checkpoint "$id": no dish is targeted more than twice across 12 target slots, and no two-target question repeats a dish', (checkpoint) => {
    const extraFilter = checkpoint.mode === 'cafe' ? isKatakanaOnlyDish : undefined
    const { targets } = getCheckpointDishPool(checkpoint.id, extraFilter)
    for (let seed = 1; seed <= 20; seed++) {
      const { usedTargetIds, targetCounts, twoTargetQuestions } = simulateSession(targets, makeRng(seed))
      expect(usedTargetIds).toHaveLength(12)
      for (const [id, count] of Object.entries(targetCounts)) {
        expect(count, `${checkpoint.id} seed ${seed}: dish "${id}" targeted ${count} times (cap is ${MAX_TARGET_USES_PER_SESSION})`).toBeLessThanOrEqual(MAX_TARGET_USES_PER_SESSION)
      }
      expect(twoTargetQuestions).toHaveLength(4)
      for (const [first, second] of twoTargetQuestions) {
        expect(first.id, `${checkpoint.id} seed ${seed}: two-target question repeats dish "${first.id}"`).not.toBe(second.id)
      }
    }
  })
})
