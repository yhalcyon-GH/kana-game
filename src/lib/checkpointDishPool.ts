import { PRACTICE_CHECKPOINTS, PRACTICE_CHECKPOINTS_BY_ID } from '../data/practiceCheckpoints'
import { RESTAURANT_DISHES, type PracticeMode, type RestaurantDish } from '../data/restaurantDishes'
import { getReadableKana, isFullyReadable } from './kanaReadability'

// Cross-mode question-TARGET eligibility exceptions (Issue #166). A dish's
// "home" practice mode is its own checkpoint's mode (see getDishHomeMode
// below) — an untagged pre-#160 dish has no checkpoint at all, and every one
// of those predates Cafe, so its home mode defaults to 'restaurant'. Some of
// those legacy items, plus a couple of early Restaurant-checkpoint items,
// were finalized (Issue #160, including its correction comments) as ALSO
// reusable as Cafe question targets once readable — that reuse is
// deliberately a small explicit allowlist here, not "every readable
// Katakana Restaurant item is Cafe-eligible": Cafe eligibility is a curated
// recognizable-loanword/cafe-appropriate role (drinks, light
// desserts/snacks), not just "happens to be readable Katakana" — e.g.
// suupu/hanbaagaa/suteeki/poteto/raamen stay Restaurant-only even though
// they're plain readable Katakana by the same checkpoints, and biiru/wain/
// uisukii (alcohol) never gain Cafe eligibility here at all.
const EXTRA_TARGET_MODES: Record<string, PracticeMode[]> = {
  // Katakana アイス/ケーキ carry the Sa-row Restaurant checkpoint (Issue
  // #160) and are ALSO reused as the Ha-row Cafe checkpoint's first Cafe
  // reuse pair; コーヒー/ピザ/パスタ join them there. ココア/ソーセージ are
  // Sa-row Restaurant's own new items, reused the same way once Cafe opens.
  aisu: ['cafe'], keeki: ['cafe'], koohii: ['cafe'], piza: ['cafe'], pasuta: ['cafe'],
  kokoa: ['cafe'], sooseeji: ['cafe'],
  // Special Katakana's four finalized Cafe reuse items (Issue #166's key
  // regression case) — untagged, pre-#160 items that predate the Cafe
  // checkpoints and so have no Cafe checkpointId of their own.
  kaferate: ['cafe'], mirukutii: ['cafe'], pafe: ['cafe'], tiramisu: ['cafe'],
  // Sokuon Cafe's named reuse quartet.
  'hotto-doggu': ['cafe'], sandoicchi: ['cafe'], kukkii: ['cafe'], 'hanbaagaa-setto': ['cafe'],
}

function getDishHomeMode(dish: RestaurantDish): PracticeMode {
  if (!dish.checkpointId) return 'restaurant'
  return PRACTICE_CHECKPOINTS_BY_ID[dish.checkpointId]?.mode ?? 'restaurant'
}

// True if `dish` may be used as a question TARGET in `mode` — its own home
// mode always qualifies; EXTRA_TARGET_MODES adds the specific approved
// cross-mode reuse exceptions on top. Exported for direct unit testing of
// the mode-eligibility rule itself, independent of checkpoint/readability
// gating.
export function isModeEligibleTarget(dish: RestaurantDish, mode: PracticeMode): boolean {
  return getDishHomeMode(dish) === mode || (EXTRA_TARGET_MODES[dish.id]?.includes(mode) ?? false)
}

// Builds a single checkpoint's target/menu dish pools, keyed by checkpoint
// id rather than RestaurantStageId (see practiceCheckpoints.ts's routePath
// comment) — a stage-wide pool let multiple checkpoints sharing one stage
// (e.g. na-row and hiragana-complete both being "hiragana") draw each
// other's dishes, so an earlier checkpoint could target/menu a later
// checkpoint's not-yet-taught spotlight items (Issue #164 review).
//
// - `menuDishes`: every dish eligible as filler at this checkpoint — a
//   pre-#160 dish (no `checkpointId`) in one of `fillerStages` AND actually
//   readable using only kana taught at/before this checkpoint's `afterRowId`
//   (see lib/kanaReadability.ts) — being in `fillerStages` alone used to be
//   enough, which let e.g. katakana-sa-row draw later-row legacy items like
//   ハンバーガー/ラーメン/ミルク just because they were old untagged
//   "katakana"-stage dishes (Issue #164 review) — or a checkpointed dish in
//   `fillerStages` whose OWN checkpoint is this checkpoint or an earlier one
//   in PRACTICE_CHECKPOINTS' approved order (already proven readable by its
//   own checkpoint's spotlight readability tests, so no need to re-check).
//   A checkpointed dish from a LATER checkpoint is never eligible, even if
//   its stage is listed in `fillerStages`. This checkpoint's own new
//   spotlight dishes (`checkpointId === checkpoint.id`) always satisfy this
//   rule too (their stage is always one of `fillerStages`, and their own
//   order trivially passes the order check), so they don't need separate
//   handling here.
// - `targets`: the subset of `menuDishes` that is also mode-eligible for
//   this checkpoint's practice mode (`isModeEligibleTarget` above) — this is
//   Issue #166's fix: previously `targets` was restricted to ONLY this
//   checkpoint's own new spotlight dishes (falling back to a hardcoded
//   same-stage dump when a checkpoint added no new dishes of its own),
//   which meant already-learned, same-mode-appropriate vocabulary already
//   sitting in `menuDishes` could only ever appear as a menu filler/
//   distractor, never get asked as the actual question target.
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

  const menuDishes = RESTAURANT_DISHES.filter((dish) => isEligibleFiller(dish) && passesExtra(dish))
  const targets = menuDishes.filter((dish) => isModeEligibleTarget(dish, checkpoint.mode))
  return { targets, menuDishes }
}
