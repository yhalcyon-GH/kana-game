import type { RestaurantDish } from '../data/restaurantDishes'

export type RestaurantRound = {
  menu: RestaurantDish[]
  target: RestaurantDish
}

export function pickRoundFromPools(targetDishes: RestaurantDish[], menuDishes: RestaurantDish[], rng: () => number = Math.random, previousTargetId?: string, usedTargetIds: string[] = []): RestaurantRound {
  if (targetDishes.length < 2 || menuDishes.length < 4) throw new Error('Restaurant pools need at least 2 targets and 4 menu dishes')
  const targetPool = targetDishes.filter((dish) => dish.id !== previousTargetId)
  const unseen = targetPool.filter((dish) => !usedTargetIds.includes(dish.id))
  const candidates = unseen.length >= 1 ? unseen : targetPool
  const target = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]
  const menuPool = menuDishes.filter((dish) => dish.id !== target.id)
  const shuffled = shuffleRestaurantChoices(menuPool, rng)
  return { target, menu: [target, ...shuffled.slice(0, 3)] }
}

export function shuffleRestaurantChoices(dishes: RestaurantDish[], rng: () => number = Math.random): RestaurantDish[] {
  const shuffled = [...dishes]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const idx = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))))
    ;[shuffled[i], shuffled[idx]] = [shuffled[idx], shuffled[i]]
  }
  return shuffled
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
