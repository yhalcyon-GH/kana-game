import type { RestaurantDish } from '../data/restaurantDishes'

// Per-dish session target-use counts (Issue #166) — tracks how many times
// each dish has been the (or a) question target so far THIS session, across
// both single- and two-target questions. Deliberately a count, not a
// used/unused boolean or an appended-ids list: the hard rule is "at most 2
// target appearances per dish per 8-question session" (Q1-4: 1 target each,
// Q5-8: 2 targets each = 12 total target slots), which needs an actual tally
// to enforce, not just "has this been seen before".
export type TargetUseCounts = Map<string, number>

export const MAX_TARGET_USES_PER_SESSION = 2

// Picks `count` distinct dishes from `pool` to be this question's target(s),
// preferring the dish(es) with the lowest session-use count so far (ties
// broken randomly via `rng`), softly avoiding `avoid` (typically the
// previous question's target ids, so back-to-back repeats are skipped when
// practical rather than guaranteed against), and hard-excluding any dish
// already at `MAX_TARGET_USES_PER_SESSION`. Mutates `counts` in place as it
// picks, so a two-target question's second pick already sees the first
// pick's incremented count, and the next question sees both.
export function pickSessionTargets(
  pool: RestaurantDish[],
  count: 1 | 2,
  counts: TargetUseCounts,
  rng: () => number = Math.random,
  avoid: ReadonlySet<string> = new Set(),
): RestaurantDish[] {
  const picked: RestaurantDish[] = []
  const excludeIds = new Set<string>()
  for (let i = 0; i < count; i++) {
    const eligible = pool.filter((dish) => !excludeIds.has(dish.id) && (counts.get(dish.id) ?? 0) < MAX_TARGET_USES_PER_SESSION)
    if (eligible.length === 0) throw new Error('No eligible session targets remain under the per-dish use cap')
    const minCount = Math.min(...eligible.map((dish) => counts.get(dish.id) ?? 0))
    const lowest = eligible.filter((dish) => (counts.get(dish.id) ?? 0) === minCount)
    const preferred = lowest.filter((dish) => !avoid.has(dish.id))
    const finalPool = preferred.length > 0 ? preferred : lowest
    const chosen = finalPool[Math.min(finalPool.length - 1, Math.floor(rng() * finalPool.length))]
    picked.push(chosen)
    excludeIds.add(chosen.id)
    counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + 1)
  }
  return picked
}
