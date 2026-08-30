import type { RestaurantDish } from '../data/restaurantDishes'

export type RestaurantRound = {
  menu: RestaurantDish[]
  target: RestaurantDish
}

// Picks 4 unique dishes from the pool (Fisher–Yates partial shuffle) then
// one of those 4 as the target to order. `rng` defaults to Math.random but
// is injectable so tests can supply a deterministic sequence — see
// restaurantRound.test.ts.
export function pickRound(dishes: RestaurantDish[], rng: () => number = Math.random, previousTargetId?: string): RestaurantRound {
  if (dishes.length < 4) {
    throw new Error(`pickRound needs at least 4 dishes, got ${dishes.length}`)
  }
  const pool = [...dishes]
  const menu: RestaurantDish[] = []
  for (let i = 0; i < 4; i++) {
    const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)))
    menu.push(...pool.splice(idx, 1))
  }
  const targetCandidates = previousTargetId ? menu.filter((dish) => dish.id !== previousTargetId) : menu
  const targetIdx = Math.min(targetCandidates.length - 1, Math.max(0, Math.floor(rng() * targetCandidates.length)))
  return { menu, target: targetCandidates[targetIdx] }
}
