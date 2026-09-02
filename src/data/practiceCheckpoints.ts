// The approved Restaurant/Cafe checkpoint roadmap (Issue #160, including its
// later correction comments — later comments supersede earlier conflicting
// ones; see the issue for full history). Each checkpoint places one
// mini-game session (Restaurant or Cafe) right after a specific row, using
// that checkpoint's new spotlight dishes plus a cumulative filler pool of
// previously-introduced dishes that are still readable at that point.
//
// Deliberately a flat config list, not a generic "Mission framework" —
// CategoryRowsPage.tsx already had ONE hardcoded inline-checkpoint row-id
// (Issue #158's HIRAGANA_RESTAURANT_CHECKPOINT_AFTER_ROW_ID); this just
// generalizes that same row-id-split mechanism to a short fixed list
// instead of building unlock/progress-gating machinery Restaurant/Cafe have
// never had and don't need (both remain outside curriculum/Review/SRS
// entirely — see restaurantDishes.ts's top comment).
import type { PracticeMode, RestaurantStageId } from './restaurantDishes'

export type PracticeCheckpoint = {
  id: string
  mode: PracticeMode
  // The row (by id) after which this checkpoint's CTA is placed inline —
  // see CategoryRowsPage.tsx's checkpoint-splitting logic.
  afterRowId: string
  // Documentation only — which curriculum category this checkpoint's row
  // conceptually belongs to (may differ from the row's own real
  // categoryId when several categories bundle onto one page, e.g. Yōon's
  // checkpoints living on the same page as Special Katakana's). Placement
  // itself is driven purely by `afterRowId` existing in a given page's
  // rendered rows (see CategoryRowsPage.tsx's splitRowsAtCheckpoints).
  categoryId: string
  // Existing RestaurantDish `stage` bucket(s) whose cumulative dishes (both
  // pre-Issue-#160 dishes and any earlier checkpoint's spotlight dishes)
  // are eligible as filler once this checkpoint is reached. Order doesn't
  // matter; pools are combined and de-duplicated by id. A dish with a
  // `checkpointId` is additionally gated by checkpoint order (see
  // lib/checkpointDishPool.ts) — being in `fillerStages` alone is not
  // enough for a dish tagged with a LATER checkpoint.
  fillerStages: RestaurantStageId[]
  routePath: string
}

// Order matches the issue's approved checkpoint sequence (1-10). Restaurant
// 1 (na-row) is Issue #158's own checkpoint, included here too so every
// checkpoint lives in one list — CategoryRowsPage no longer needs a
// separate hardcoded constant for it.
// Each Restaurant checkpoint gets its OWN route keyed by checkpoint id
// (matching Cafe's existing `/cafe/:checkpointId` pattern) rather than
// sharing one route per RestaurantStageId — see lib/checkpointDishPool.ts's
// comment for why multiple checkpoints sharing a stage-wide route used to
// let an earlier checkpoint draw a later checkpoint's not-yet-taught dishes.
export const PRACTICE_CHECKPOINTS: PracticeCheckpoint[] = [
  { id: 'na-row', mode: 'restaurant', afterRowId: 'na-row', categoryId: 'hiragana', fillerStages: ['hiragana'], routePath: '/restaurant/na-row' },
  { id: 'hiragana-complete', mode: 'restaurant', afterRowId: 'ra-row', categoryId: 'hiragana', fillerStages: ['hiragana'], routePath: '/restaurant/hiragana-complete' },
  { id: 'katakana-sa-row', mode: 'restaurant', afterRowId: 'katakana-sa-row', categoryId: 'katakana', fillerStages: ['hiragana', 'katakana'], routePath: '/restaurant/katakana-sa-row' },
  { id: 'katakana-ha-row', mode: 'cafe', afterRowId: 'katakana-ha-row', categoryId: 'katakana', fillerStages: ['katakana'], routePath: '/cafe/katakana-ha-row' },
  { id: 'katakana-complete', mode: 'restaurant', afterRowId: 'katakana-ra-row', categoryId: 'katakana', fillerStages: ['hiragana', 'katakana'], routePath: '/restaurant/katakana-complete' },
  { id: 'sokuon-complete', mode: 'cafe', afterRowId: 'sokuon-row', categoryId: 'other', fillerStages: ['katakana', 'other'], routePath: '/cafe/sokuon-complete' },
  { id: 'chouon-complete', mode: 'restaurant', afterRowId: 'chouon-katakana-row', categoryId: 'other', fillerStages: ['hiragana', 'katakana', 'other'], routePath: '/restaurant/chouon-complete' },
  { id: 'hiragana-youon-complete', mode: 'restaurant', afterRowId: 'youon-ma-ra-row', categoryId: 'youon', fillerStages: ['hiragana', 'katakana', 'other', 'special-katakana'], routePath: '/restaurant/hiragana-youon-complete' },
  { id: 'katakana-youon-complete', mode: 'restaurant', afterRowId: 'youon-katakana-ma-ra-row', categoryId: 'youon', fillerStages: ['hiragana', 'katakana', 'other', 'special-katakana'], routePath: '/restaurant/katakana-youon-complete' },
  { id: 'special-katakana-complete', mode: 'cafe', afterRowId: 'special-katakana-she-row', categoryId: 'youon', fillerStages: ['katakana', 'special-katakana'], routePath: '/cafe/special-katakana-complete' },
]

export const PRACTICE_CHECKPOINTS_BY_ID: Record<string, PracticeCheckpoint> = Object.fromEntries(
  PRACTICE_CHECKPOINTS.map((c) => [c.id, c]),
)
