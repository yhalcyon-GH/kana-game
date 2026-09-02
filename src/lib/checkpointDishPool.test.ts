import { describe, expect, it } from 'vitest'
import { PRACTICE_CHECKPOINTS } from '../data/practiceCheckpoints'
import { isKatakanaOnlyDish, isTargetEligibleFor } from '../data/restaurantDishes'
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

  // Issue #166 (and its follow-up correction): カフェラテ/ミルクティー/
  // パフェ/ティラミス predate the checkpoint roadmap (no `checkpointId`) but
  // require special-katakana kana (フェ/ティ) that isn't actually readable
  // until special-katakana-complete — NOT at katakana-youon-complete, even
  // though that's the only checkpoint sharing their raw `stage`. They must
  // never be katakana-youon-complete Restaurant targets (see the readability
  // audit below); they belong to special-katakana-complete's Cafe pool
  // instead (next test). katakana-youon-complete's own approved reuse set is
  // the other 6 legacy items whose kana genuinely IS readable by then.
  it('katakana-youon-complete includes its approved existing Restaurant reuse items, never the Special-Katakana-only Cafe legacy items', () => {
    const { targets, menuDishes } = getCheckpointDishPool('katakana-youon-complete')
    const ids = targets.map((d) => d.id)
    for (const id of ['chaahan', 'gyouza', 'shichuu', 'orenji-juusu', 'ryokucha', 'choko-aisu']) {
      expect(ids, `missing approved existing target "${id}"`).toContain(id)
    }
    for (const id of ['kaferate', 'mirukutii', 'pafe', 'tiramisu']) {
      expect(ids, `"${id}" is not readable until special-katakana-complete and must not target here`).not.toContain(id)
    }
    const menuIds = menuDishes.map((d) => d.id)
    expect(menuIds).not.toContain('remontii')
    expect(menuIds).not.toContain('mineraruwootaa')
  })

  // Regression case for Issue #166: the question TARGET pool used to be
  // restricted to a checkpoint's own new spotlight (here just 2 items),
  // silently starving the session down to repeating レモンティー/
  // ミネラルウォーター all 8 questions even though the finalized reuse set
  // (カフェラテ/ミルクティー/パフェ/ティラミス) already existed in the data.
  it('special-katakana-complete (Cafe, final checkpoint) targets its 2 new items plus the finalized legacy Cafe reuse set', () => {
    const { targets } = getCheckpointDishPool('special-katakana-complete', isKatakanaOnlyDish)
    const ids = targets.map((d) => d.id)
    for (const id of ['remontii', 'mineraruwootaa', 'kaferate', 'mirukutii', 'pafe', 'tiramisu']) {
      expect(ids, `missing target-eligible dish "${id}"`).toContain(id)
    }
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
  // mechanically proves every runtime menu filler AND every target (both
  // checkpointed spotlight AND cumulative legacy reuse, Issue #166) is
  // readable by their checkpoint, for all 10 checkpoints. There is
  // deliberately no exemption here anymore — katakana-youon-complete's old
  // wholesale fallback-by-stage target pool used to bypass this check
  // entirely, which is exactly how カフェラテ/ミルクティー/パフェ/ティラミス
  // (not actually readable until special-katakana-complete) ended up
  // targeted too early; see restaurantDishes.ts's targetIntroductionsById.
  it.each(PRACTICE_CHECKPOINTS)(
    'checkpoint "$id": every target and every menu filler is readable using kana taught by then',
    (checkpoint) => {
      const extraFilter = checkpoint.mode === 'cafe' ? isKatakanaOnlyDish : undefined
      const { menuDishes } = getCheckpointDishPool(checkpoint.id, extraFilter)
      const kanaSet = getReadableKana(checkpoint.afterRowId)
      expect(kanaSet.size).toBeGreaterThan(0)
      for (const dish of menuDishes) {
        expect(
          isFullyReadable(dish.displayKana, kanaSet),
          `${checkpoint.id}: dish "${dish.id}" ("${dish.displayKana}") is not readable using kana taught through "${checkpoint.afterRowId}"`,
        ).toBe(true)
      }
    },
  )

  // Issue #166 required test: target selection must stay same-mode
  // appropriate — a Restaurant checkpoint's targets must never be dishes
  // whose only approved introduction is Cafe (and vice versa), even when a
  // dish is eventually approved for BOTH modes (e.g. ココア/ソーセージ).
  it.each(PRACTICE_CHECKPOINTS)('checkpoint "$id": every target is introduced for this checkpoint\'s own mode ("$mode")', (checkpoint) => {
    const extraFilter = checkpoint.mode === 'cafe' ? isKatakanaOnlyDish : undefined
    const { targets } = getCheckpointDishPool(checkpoint.id, extraFilter)
    const order = PRACTICE_CHECKPOINTS.indexOf(checkpoint)
    for (const dish of targets) {
      expect(isTargetEligibleFor(dish, checkpoint.mode, order), `${checkpoint.id}: "${dish.id}" is not a "${checkpoint.mode}" target by this checkpoint`).toBe(true)
    }
  })

  // Issue #166's named "existing/reuse" sets must remain actual TARGET
  // candidates (not just menu fillers) at their approved checkpoint.
  const reuseCases: { checkpointId: string; mode?: 'cafe'; reuseIds: string[] }[] = [
    { checkpointId: 'katakana-sa-row', reuseIds: ['aisu', 'keeki'] },
    { checkpointId: 'katakana-ha-row', mode: 'cafe', reuseIds: ['aisu', 'keeki', 'koohii', 'piza', 'pasuta', 'kokoa', 'sooseeji'] },
    { checkpointId: 'sokuon-complete', mode: 'cafe', reuseIds: ['hotto-doggu', 'sandoicchi', 'kukkii', 'hanbaagaa-setto', 'toosuto', 'chiizu', 'doonatsu', 'chiizukeeki', 'pankeeki'] },
    { checkpointId: 'chouon-complete', reuseIds: ['toufu'] },
    { checkpointId: 'hiragana-youon-complete', reuseIds: ['gyouza', 'ryokucha'] },
    { checkpointId: 'katakana-youon-complete', reuseIds: ['chaahan', 'shichuu', 'orenji-juusu', 'choko-aisu', 'gyouza', 'ryokucha'] },
    { checkpointId: 'special-katakana-complete', mode: 'cafe', reuseIds: ['kaferate', 'mirukutii', 'pafe', 'tiramisu', 'remontii', 'mineraruwootaa'] },
  ]
  it.each(reuseCases)('checkpoint "$checkpointId" keeps its finalized reuse set target-eligible', ({ checkpointId, mode, reuseIds }) => {
    const { targets } = getCheckpointDishPool(checkpointId, mode === 'cafe' ? isKatakanaOnlyDish : undefined)
    const ids = targets.map((d) => d.id)
    for (const id of reuseIds) expect(ids, `"${id}" missing from "${checkpointId}"'s target pool`).toContain(id)
  })

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
