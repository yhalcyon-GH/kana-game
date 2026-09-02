import { describe, expect, it } from 'vitest'
import { PRACTICE_CHECKPOINTS } from '../data/practiceCheckpoints'
import { isKatakanaOnlyDish } from '../data/restaurantDishes'
import { getCheckpointDishPool } from './checkpointDishPool'
import { getReadableKana, isFullyReadable } from './kanaReadability'

// Issue #164 review: multiple checkpoints used to share one RestaurantStageId
// route (e.g. na-row and hiragana-complete both "/restaurant/hiragana"),
// which let an earlier checkpoint's active pool draw a LATER checkpoint's
// not-yet-taught spotlight dishes. getCheckpointDishPool is keyed by
// checkpoint id instead — these tests mechanically prove no checkpoint's
// target/menu pool ever contains a dish tagged with a later checkpoint,
// for every checkpoint (not just the ones named in the review).
describe('getCheckpointDishPool — no future-item leakage', () => {
  it.each(PRACTICE_CHECKPOINTS.map((c, index) => ({ checkpoint: c, order: index })))(
    'checkpoint "$checkpoint.id" never targets or menus a dish from a later checkpoint',
    ({ checkpoint, order }) => {
      const extraFilter = checkpoint.mode === 'cafe' ? isKatakanaOnlyDish : undefined
      const { targets, menuDishes } = getCheckpointDishPool(checkpoint.id, extraFilter)
      for (const dish of [...targets, ...menuDishes]) {
        if (!dish.checkpointId) continue
        const dishOrder = PRACTICE_CHECKPOINTS.findIndex((c) => c.id === dish.checkpointId)
        expect(dishOrder, `${checkpoint.id}: dish "${dish.id}" references unknown checkpoint "${dish.checkpointId}"`).toBeGreaterThanOrEqual(0)
        expect(dishOrder, `${checkpoint.id}: dish "${dish.id}" belongs to LATER checkpoint "${dish.checkpointId}"`).toBeLessThanOrEqual(order)
      }
    },
  )

  it('Restaurant 1 (na-row) keeps the exact approved 11-target pool, none from hiragana-complete', () => {
    const { targets } = getCheckpointDishPool('na-row')
    expect(targets.map((d) => d.id).sort()).toEqual(
      ['sushi', 'udon', 'tonkatsu', 'katsudon', 'oden', 'unagi', 'dango', 'tendon', 'kaisendon', 'unidon', 'kani'].sort(),
    )
  })

  it('katakana-sa-row does not draw katakana-ha-row (Cafe) or katakana-complete items', () => {
    const { menuDishes } = getCheckpointDishPool('katakana-sa-row')
    const leaked = ['chiizu', 'chiizukeeki', 'doonatsu', 'pankeeki', 'toosuto', 'furaidochikin', 'biiru', 'wain', 'haibooru', 'teriyakichikin']
    const ids = menuDishes.map((d) => d.id)
    for (const id of leaked) expect(ids, `unexpectedly includes future item "${id}"`).not.toContain(id)
  })

  it('chouon-complete does not draw later hiragana-youon-complete items', () => {
    const { menuDishes } = getCheckpointDishPool('chouon-complete')
    const leaked = ['gyuudon', 'shuumai', 'kyuuri', 'koucha', 'nihonshu']
    const ids = menuDishes.map((d) => d.id)
    for (const id of leaked) expect(ids, `unexpectedly includes future item "${id}"`).not.toContain(id)
  })

  it('katakana-youon-complete uses its approved existing spotlight pool, not any future special-katakana-complete Cafe item', () => {
    const { targets, menuDishes } = getCheckpointDishPool('katakana-youon-complete')
    expect(targets.map((d) => d.id).sort()).toEqual(
      ['chaahan', 'gyouza', 'shichuu', 'kaferate', 'mirukutii', 'orenji-juusu', 'ryokucha', 'pafe', 'tiramisu', 'choko-aisu'].sort(),
    )
    const ids = menuDishes.map((d) => d.id)
    expect(ids).not.toContain('remontii')
    expect(ids).not.toContain('mineraruwootaa')
  })

  it('special-katakana-complete (Cafe, final checkpoint) targets exactly the 2 approved items', () => {
    const { targets } = getCheckpointDishPool('special-katakana-complete', isKatakanaOnlyDish)
    expect(targets.map((d) => d.id).sort()).toEqual(['remontii', 'mineraruwootaa'].sort())
  })

  it('every checkpoint has enough targets/menu dishes for the ordering game (>=2 targets, >=4 menu dishes)', () => {
    for (const checkpoint of PRACTICE_CHECKPOINTS) {
      const extraFilter = checkpoint.mode === 'cafe' ? isKatakanaOnlyDish : undefined
      const { targets, menuDishes } = getCheckpointDishPool(checkpoint.id, extraFilter)
      expect(targets.length, `${checkpoint.id}: too few targets`).toBeGreaterThanOrEqual(2)
      expect(menuDishes.length, `${checkpoint.id}: too few menu dishes`).toBeGreaterThanOrEqual(4)
    }
  })

  // Issue #164 review (round 2): stage membership in `fillerStages` alone
  // used to be enough for a pre-#160/untagged dish to become a menu filler,
  // even if the learner hasn't actually been taught its kana yet (e.g.
  // katakana-sa-row could draw ハンバーガー/ラーメン/ミルク just because
  // they're old untagged "katakana"-stage dishes). getCheckpointDishPool now
  // additionally requires readability via lib/kanaReadability.ts. This
  // mechanically proves every runtime menu filler AND every checkpointed
  // spotlight target is readable by their checkpoint, for all 10
  // checkpoints — not just the spotlight-only cases already covered in
  // restaurantDishes.test.ts. The ONE exemption: katakana-youon-complete's
  // approved pre-#160 fallback target pool (untagged dishes reused wholesale
  // as "existing suitable items carry it", per Issue #160) is intentionally
  // NOT re-litigated here — see the "approved existing spotlight pool" test
  // above and Issue #164 review's instruction to keep it intact.
  it.each(PRACTICE_CHECKPOINTS)(
    'checkpoint "$id": every checkpointed target and every menu filler is readable using kana taught by then',
    (checkpoint) => {
      const extraFilter = checkpoint.mode === 'cafe' ? isKatakanaOnlyDish : undefined
      const { targets, menuDishes } = getCheckpointDishPool(checkpoint.id, extraFilter)
      const kanaSet = getReadableKana(checkpoint.afterRowId)
      expect(kanaSet.size).toBeGreaterThan(0)
      const targetIds = new Set(targets.map((d) => d.id))
      for (const dish of menuDishes) {
        const isApprovedFallbackTarget = !dish.checkpointId && targetIds.has(dish.id)
        if (isApprovedFallbackTarget) continue
        expect(
          isFullyReadable(dish.displayKana, kanaSet),
          `${checkpoint.id}: dish "${dish.id}" ("${dish.displayKana}") is not readable using kana taught through "${checkpoint.afterRowId}"`,
        ).toBe(true)
      }
    },
  )

  it('katakana-sa-row excludes later-row legacy Katakana fillers not yet readable (ラーメン/ミルク)', () => {
    const { menuDishes } = getCheckpointDishPool('katakana-sa-row')
    const ids = menuDishes.map((d) => d.id)
    for (const id of ['raamen', 'miruku']) {
      expect(ids, `unexpectedly includes not-yet-readable legacy item "${id}"`).not.toContain(id)
    }
    // アイス/ケーキ ARE readable this early (あ/か-row) and are the approved
    // reuse pair named by the issue's correction for this checkpoint.
    expect(ids).toEqual(expect.arrayContaining(['aisu', 'keeki']))
  })

  it('katakana-ha-row (Cafe) excludes later-row legacy Katakana fillers not yet readable (ラーメン/ミルク)', () => {
    const { menuDishes } = getCheckpointDishPool('katakana-ha-row', isKatakanaOnlyDish)
    const ids = menuDishes.map((d) => d.id)
    for (const id of ['raamen', 'miruku']) {
      expect(ids, `unexpectedly includes not-yet-readable legacy item "${id}"`).not.toContain(id)
    }
  })
})
