import type { RestaurantDish } from '../data/restaurantDishes'

export type RestaurantRound = {
  menu: RestaurantDish[]
  target: RestaurantDish
}

// Hard per-session cap on how many times one dish may be asked as a
// question target across an 8-question Restaurant/Cafe session (Issue
// #166): Q1-4 contribute 1 target slot each and Q5-8 contribute 2 each, 12
// slots total. `usedTargetIds` (kept by useOrderingGame.ts) is a flat list
// with one entry PER past target slot, so a dish's use count is just how
// many times its id appears in it.
export const MAX_TARGET_USES_PER_SESSION = 2

export function countTargetUses(usedTargetIds: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const id of usedTargetIds) counts[id] = (counts[id] ?? 0) + 1
  return counts
}

// Picks the next question target from `pool`. Selection order:
// 1. Hard-exclude `exclude` (e.g. the OTHER target already chosen for this
//    same two-target question — a dish must never appear twice in one
//    question) — falls back to the full pool only if that would leave zero
//    candidates (shouldn't happen given the minimum pool sizes elsewhere).
// 2. Prefer dishes still under MAX_TARGET_USES_PER_SESSION — falls back to
//    the full (post-exclude) set only if every remaining dish is already at
//    the cap (shouldn't happen with the current cumulative pools, per Issue
//    #166 — pools are large enough that this branch is a safety net, not
//    the normal path).
// 3. Among those, prefer the lowest current use count.
// 4. Among ties, soft-avoid `avoidIds` (e.g. the immediately previous
//    question's target, or a dish that would recreate an already-asked
//    pair) when a same-use-count alternative exists.
// 5. Randomize among whatever's left (`rng`).
export function pickCappedTarget(
  pool: RestaurantDish[],
  usedTargetIds: string[],
  exclude: string[] = [],
  avoidIds: string[] = [],
  rng: () => number = Math.random,
): RestaurantDish {
  const available = pool.filter((dish) => !exclude.includes(dish.id))
  const base = available.length ? available : pool
  const counts = countTargetUses(usedTargetIds)
  const underCap = base.filter((dish) => (counts[dish.id] ?? 0) < MAX_TARGET_USES_PER_SESSION)
  const capped = underCap.length ? underCap : base
  const minCount = Math.min(...capped.map((dish) => counts[dish.id] ?? 0))
  const lowest = capped.filter((dish) => (counts[dish.id] ?? 0) === minCount)
  const preferred = avoidIds.length ? lowest.filter((dish) => !avoidIds.includes(dish.id)) : lowest
  const candidates = preferred.length ? preferred : lowest
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]
}

export function pickRoundFromPools(targetDishes: RestaurantDish[], menuDishes: RestaurantDish[], rng: () => number = Math.random, previousTargetId?: string, usedTargetIds: string[] = [], previousMenuKey?: string): RestaurantRound {
  if (targetDishes.length < 2 || menuDishes.length < 4) throw new Error('Restaurant pools need at least 2 targets and 4 menu dishes')
  const target = pickCappedTarget(targetDishes, usedTargetIds, previousTargetId ? [previousTargetId] : [], [], rng)
  const menuPool = menuDishes.filter((dish) => dish.id !== target.id)
  let menu = shuffleRestaurantChoices([target, ...shuffleRestaurantChoices(menuPool, rng).slice(0, 3)], rng)
  for (let attempt = 0; attempt < 3 && previousMenuKey && menuKey(menu) === previousMenuKey; attempt++) {
    menu = shuffleRestaurantChoices([target, ...shuffleRestaurantChoices(menuPool, rng).slice(0, 3)], rng)
  }
  return { target, menu }
}

export function menuKey(menu: RestaurantDish[]): string {
  return menu.map((dish) => dish.id).sort().join('|')
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
