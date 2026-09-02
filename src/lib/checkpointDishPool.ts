import { PRACTICE_CHECKPOINTS, PRACTICE_CHECKPOINTS_BY_ID } from '../data/practiceCheckpoints'
import { RESTAURANT_DISHES, type RestaurantDish } from '../data/restaurantDishes'
import { getReadableKana, isFullyReadable } from './kanaReadability'

// Builds a single checkpoint's target/menu dish pools, keyed by checkpoint
// id rather than RestaurantStageId (see practiceCheckpoints.ts's routePath
// comment) — a stage-wide pool let multiple checkpoints sharing one stage
// (e.g. na-row and hiragana-complete both being "hiragana") draw each
// other's dishes, so an earlier checkpoint could target/menu a later
// checkpoint's not-yet-taught spotlight items (Issue #164 review).
//
// - `targets`: this checkpoint's own new spotlight dishes (`checkpointId`
//   matches). If it has none (only katakana-youon-complete today), falls
//   back to its approved pre-#160 dishes for its own `stage` — "existing
//   suitable items carry it" (Issue #160) — rather than every dish in that
//   stage, which would include a LATER checkpoint's own spotlight too.
// - `menuDishes`: targets plus every dish eligible as filler — a pre-#160
//   dish (no `checkpointId`) in one of `fillerStages` AND actually readable
//   using only kana taught at/before this checkpoint's `afterRowId` (see
//   lib/kanaReadability.ts) — being in `fillerStages` alone used to be
//   enough, which let e.g. katakana-sa-row draw later-row legacy items like
//   ハンバーガー/ラーメン/ミルク just because they were old untagged
//   "katakana"-stage dishes (Issue #164 review) — or a checkpointed dish in
//   `fillerStages` whose OWN checkpoint is this checkpoint or an earlier one
//   in PRACTICE_CHECKPOINTS' approved order (already proven readable by its
//   own checkpoint's spotlight readability tests, so no need to re-check).
//   A checkpointed dish from a LATER checkpoint is never eligible, even if
//   its stage is listed in `fillerStages`.
export function getCheckpointDishPool(
  checkpointId: string,
  extraFilter?: (dish: RestaurantDish) => boolean,
): { targets: RestaurantDish[]; menuDishes: RestaurantDish[] } {
  const checkpoint = PRACTICE_CHECKPOINTS_BY_ID[checkpointId]
  if (!checkpoint) return { targets: [], menuDishes: [] }
  const order = PRACTICE_CHECKPOINTS.indexOf(checkpoint)
  const passesExtra = (dish: RestaurantDish) => !extraFilter || extraFilter(dish)
  const readableKana = getReadableKana(checkpoint.afterRowId)

  const isEligibleFiller = (dish: RestaurantDish) => {
    if (!checkpoint.fillerStages.includes(dish.stage)) return false
    if (!dish.checkpointId) return isFullyReadable(dish.displayKana, readableKana)
    const dishOrder = PRACTICE_CHECKPOINTS.findIndex((c) => c.id === dish.checkpointId)
    return dishOrder !== -1 && dishOrder <= order
  }

  const ownSpotlight = RESTAURANT_DISHES.filter((dish) => dish.checkpointId === checkpoint.id && passesExtra(dish))
  const targets = ownSpotlight.length > 0
    ? ownSpotlight
    : RESTAURANT_DISHES.filter((dish) => !dish.checkpointId && dish.stage === checkpoint.stage && passesExtra(dish))
  const fillerPool = RESTAURANT_DISHES.filter((dish) => isEligibleFiller(dish) && passesExtra(dish))
  const menuDishes = Array.from(new Map([...targets, ...fillerPool].map((dish) => [dish.id, dish])).values())
  return { targets, menuDishes }
}
