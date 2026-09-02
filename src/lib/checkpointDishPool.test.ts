import { describe, expect, it } from 'vitest'
import { PRACTICE_CHECKPOINTS } from '../data/practiceCheckpoints'
import { isKatakanaOnlyDish } from '../data/restaurantDishes'
import { getCheckpointDishPool, isModeEligibleTarget } from './checkpointDishPool'
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

  // Issue #166: katakana-youon-complete has no new spotlight dishes of its
  // own, so its approved pre-#160 special-katakana fallback pool ("existing
  // suitable Restaurant yōon items remain target-eligible") must still be
  // selectable as an actual target — no longer the ONLY targets available,
  // since the checkpoint's cumulative Restaurant-mode readable vocabulary
  // (hiragana/katakana/other dishes learned by this point) is now also
  // target-eligible, per Issue #166's general fix. Only 6 of that fallback
  // stage's 10 untagged dishes are asserted here (not all 10, unlike the
  // pre-#166 code): カフェラテ/ミルクティー/パフェ/ティラミス use フェ/ティ,
  // real Special Katakana glyphs not taught until AFTER this checkpoint (its
  // own afterRowId is still in the Yōon category) — the pre-#166 fallback
  // bypassed readability checking entirely and would have wrongly offered
  // them here too, which is exactly the "full target/menu readability at
  // each checkpoint" safety constraint Issue #166 requires stay intact.
  // They correctly become available once special-katakana-complete is
  // reached (see the dedicated test below).
  it('katakana-youon-complete keeps its approved existing spotlight pool target-eligible (the readable subset), not any future special-katakana-complete Cafe item', () => {
    const { targets, menuDishes } = getCheckpointDishPool('katakana-youon-complete')
    expect(targets.map((d) => d.id)).toEqual(expect.arrayContaining(
      ['chaahan', 'gyouza', 'shichuu', 'orenji-juusu', 'ryokucha', 'choko-aisu'],
    ))
    const ids = menuDishes.map((d) => d.id)
    expect(ids).not.toContain('kaferate')
    expect(ids).not.toContain('mirukutii')
    expect(ids).not.toContain('pafe')
    expect(ids).not.toContain('tiramisu')
    expect(ids).not.toContain('remontii')
    expect(ids).not.toContain('mineraruwootaa')
  })

  // Issue #166's key regression case: previously ONLY レモンティー/
  // ミネラルウォーター (this checkpoint's own new spotlight) could ever be
  // asked as a question TARGET — カフェラテ/ミルクティー/パフェ/ティラミス
  // (the finalized Issue #160 Cafe reuse set) and earlier Cafe items were
  // stuck as menu fillers/distractors only. This asserts the exact restored
  // target pool: the 2 new items, the 4 legacy reuse items, and every
  // earlier-Cafe-checkpoint reuse item that's still readable/mode-eligible
  // here (katakana-ha-row's 5 new items + the アイス/ケーキ/コーヒー/ピザ/
  // パスタ/ココア/ソーセージ reuse set) — never a Restaurant-only item like
  // ハンバーガー/ステーキ/ポテト or an alcohol item like ビール/ワイン.
  it('special-katakana-complete (Cafe, final checkpoint) restores the full approved reuse target pool, including legacy Cafe items as actual targets', () => {
    const { targets } = getCheckpointDishPool('special-katakana-complete', isKatakanaOnlyDish)
    expect(targets.map((d) => d.id).sort()).toEqual(
      [
        'remontii', 'mineraruwootaa',
        'kaferate', 'mirukutii', 'pafe', 'tiramisu',
        'toosuto', 'chiizu', 'doonatsu', 'chiizukeeki', 'pankeeki',
        'aisu', 'keeki', 'koohii', 'piza', 'pasuta', 'kokoa', 'sooseeji',
      ].sort(),
    )
  })

  it('katakana-ha-row (Cafe) restores the exact approved reuse target pool: new Cafe items plus the named Katakana reuse set', () => {
    const { targets } = getCheckpointDishPool('katakana-ha-row', isKatakanaOnlyDish)
    expect(targets.map((d) => d.id).sort()).toEqual(
      ['toosuto', 'chiizu', 'doonatsu', 'chiizukeeki', 'pankeeki', 'aisu', 'keeki', 'koohii', 'piza', 'pasuta', 'kokoa', 'sooseeji'].sort(),
    )
  })

  it('sokuon-complete (Cafe) restores the exact approved reuse target pool: new ッ items plus every earlier Cafe reuse item', () => {
    const { targets } = getCheckpointDishPool('sokuon-complete', isKatakanaOnlyDish)
    expect(targets.map((d) => d.id).sort()).toEqual(
      [
        'waffuru', 'esupuresso', 'appurupai',
        'hotto-doggu', 'sandoicchi', 'kukkii', 'hanbaagaa-setto',
        'toosuto', 'chiizu', 'doonatsu', 'chiizukeeki', 'pankeeki',
        'aisu', 'keeki', 'koohii', 'piza', 'pasuta', 'kokoa', 'sooseeji',
      ].sort(),
    )
  })

  it('katakana-sa-row (Restaurant) restores the exact approved reuse target pool: new items, アイス/ケーキ, plus every readable Hiragana Restaurant dish', () => {
    const { targets } = getCheckpointDishPool('katakana-sa-row')
    expect(targets.map((d) => d.id).sort()).toEqual(
      [
        'kokoa', 'sooseeji', 'uisukii',
        'aisu', 'keeki',
        'sushi', 'udon', 'tonkatsu', 'katsudon', 'oden', 'unagi', 'dango', 'tendon', 'kaisendon', 'unidon', 'kani',
        'yakisoba', 'okonomiyaki', 'tamagoyaki', 'karaage',
      ].sort(),
    )
  })

  // Mode isolation (Issue #166): being readable Katakana is not enough for
  // Cafe target eligibility on its own — heavier Restaurant-only items and
  // every finalized alcohol item must never appear as a Cafe target, even
  // though they're plain readable Katakana by the same checkpoints.
  it('no Cafe checkpoint ever targets a Restaurant-only or alcohol item', () => {
    const neverCafeTargets = ['hanbaagaa', 'suteeki', 'poteto', 'suupu', 'karee', 'sarada', 'raamen', 'koora', 'miruku', 'purin', 'zerii', 'korokke', 'hotto-kokoa', 'toufu', 'biiru', 'wain', 'haibooru', 'uisukii']
    for (const checkpoint of PRACTICE_CHECKPOINTS.filter((c) => c.mode === 'cafe')) {
      const { targets } = getCheckpointDishPool(checkpoint.id, isKatakanaOnlyDish)
      const ids = targets.map((d) => d.id)
      for (const id of neverCafeTargets) {
        expect(ids, `${checkpoint.id}: unexpectedly targets Restaurant-only/alcohol item "${id}"`).not.toContain(id)
      }
    }
  })

  it('isModeEligibleTarget: every target returned by getCheckpointDishPool is actually mode-eligible for its checkpoint', () => {
    for (const checkpoint of PRACTICE_CHECKPOINTS) {
      const extraFilter = checkpoint.mode === 'cafe' ? isKatakanaOnlyDish : undefined
      const { targets } = getCheckpointDishPool(checkpoint.id, extraFilter)
      for (const dish of targets) {
        expect(isModeEligibleTarget(dish, checkpoint.mode), `${checkpoint.id}: target "${dish.id}" is not mode-eligible for "${checkpoint.mode}"`).toBe(true)
      }
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
  // mechanically proves every runtime menu filler is readable by their
  // checkpoint, for all 10 checkpoints — not just the spotlight-only cases
  // already covered in restaurantDishes.test.ts. Since Issue #166, `targets`
  // is always a subset of `menuDishes` (see checkpointDishPool.ts), so
  // checking every menu filler covers every target too — no separate
  // exemption needed.
  it.each(PRACTICE_CHECKPOINTS)(
    'checkpoint "$id": every menu filler (and therefore every target) is readable using kana taught by then',
    (checkpoint) => {
      const extraFilter = checkpoint.mode === 'cafe' ? isKatakanaOnlyDish : undefined
      const { targets, menuDishes } = getCheckpointDishPool(checkpoint.id, extraFilter)
      const kanaSet = getReadableKana(checkpoint.afterRowId)
      expect(kanaSet.size).toBeGreaterThan(0)
      const menuIds = new Set(menuDishes.map((d) => d.id))
      for (const dish of targets) expect(menuIds.has(dish.id), `${checkpoint.id}: target "${dish.id}" is not in menuDishes`).toBe(true)
      for (const dish of menuDishes) {
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
