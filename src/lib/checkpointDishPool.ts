import { PRACTICE_CHECKPOINTS, PRACTICE_CHECKPOINTS_BY_ID } from '../data/practiceCheckpoints'
import { RESTAURANT_DISHES, isTargetEligibleFor, type RestaurantDish } from '../data/restaurantDishes'
import { getReadableKana, isFullyReadable } from './kanaReadability'

// Builds a single checkpoint's target/menu dish pools, keyed by checkpoint
// id rather than RestaurantStageId (see practiceCheckpoints.ts's routePath
// comment) — a stage-wide pool let multiple checkpoints sharing one stage
// (e.g. na-row and hiragana-complete both being "hiragana") draw each
// other's dishes, so an earlier checkpoint could target/menu a later
// checkpoint's not-yet-taught spotlight items (Issue #164 review).
//
// - `targets`: every dish that has become a target for this checkpoint's
//   own `mode` at or before this checkpoint's order (see
//   data/restaurantDishes.ts's getTargetIntroductions/isTargetEligibleFor).
//   This is CUMULATIVE across every earlier same-mode checkpoint, not just
//   this checkpoint's own new spotlight — Issue #166: a checkpoint's
//   question pool must include its own new vocabulary AND already-learned,
//   readable same-mode vocabulary, not just whatever happens to be new here
//   (which used to starve a checkpoint like Special Katakana Cafe, whose own
//   spotlight is only 2 items, down to repeating just those 2 all session).
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

  const targets = RESTAURANT_DISHES.filter((dish) => isTargetEligibleFor(dish, checkpoint.mode, order) && passesExtra(dish))
  const menuDishes = RESTAURANT_DISHES.filter((dish) =>
    isTargetEligibleFor(dish, checkpoint.mode, order) &&
    isFullyReadable(dish.displayKana, readableKana) &&
    passesExtra(dish),
  )
  return { targets, menuDishes }
}
