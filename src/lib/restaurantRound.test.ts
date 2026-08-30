import { describe, expect, it } from 'vitest'
import { HIRAGANA_RESTAURANT_DISHES, KATAKANA_RESTAURANT_DISHES } from '../data/restaurantDishes'
import { pickRound, pickRoundFromPools, shuffleRestaurantChoices } from './restaurantRound'

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
    expect(shuffled.map((dish) => dish.id)).toEqual(['soba', 'udon', 'tenpura', 'sushi'])
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
})
