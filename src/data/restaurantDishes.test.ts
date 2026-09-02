import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CAFE_DISHES,
  HIRAGANA_RESTAURANT_DISHES,
  KATAKANA_RESTAURANT_DISHES,
  OTHER_RESTAURANT_DISHES,
  RESTAURANT_DISHES,
  SPECIAL_KATAKANA_RESTAURANT_DISHES,
  isKatakanaOnlyDish,
} from './restaurantDishes'
import { CHARACTERS } from './characters'
import { getCumulativeCharacterIds } from './curriculum'
import { PRACTICE_CHECKPOINTS, PRACTICE_CHECKPOINTS_BY_ID } from './practiceCheckpoints'
import { getReadableKana } from '../lib/kanaReadability'

const SMALL_TSU = 'っ'
const YOON = ['ゃ', 'ゅ', 'ょ']

function isHiraganaOnly(text: string): boolean {
  return [...text].every((ch) => ch >= 'ぁ' && ch <= 'ゖ')
}

// Greedy longest-match tiling against every kana STRING (not single
// character) taught by `rowIds`' cumulative union — needed because Yōon
// characters are stored as combined two-glyph kana (e.g. "きゃ"), so a
// per-character Set membership check would wrongly reject "ぎゅうどん"
// (containing "ぎゅ") even though ぎゅ itself is taught.
function readableKanaSet(rowIds: string[]): Set<string> {
  const ids = rowIds.flatMap((rowId) => getCumulativeCharacterIds(rowId))
  return new Set(ids.map((id) => CHARACTERS.find((c) => c.id === id)?.kana).filter((k): k is string => !!k))
}

function isFullyReadable(word: string, kanaSet: Set<string>): boolean {
  const sorted = [...kanaSet].sort((a, b) => b.length - a.length)
  let i = 0
  while (i < word.length) {
    const match = sorted.find((k) => word.startsWith(k, i))
    if (!match) return false
    i += match.length
  }
  return true
}

describe('restaurantDishes (hiragana stage)', () => {
  it('has exactly 15 hiragana dishes (11 Restaurant-1 + 4 hiragana-complete, Issue #160)', () => {
    expect(HIRAGANA_RESTAURANT_DISHES).toHaveLength(15)
  })

  it('every hiragana dish is stage "hiragana" with requiredCategories ["hiragana"]', () => {
    for (const dish of HIRAGANA_RESTAURANT_DISHES) {
      expect(dish.stage).toBe('hiragana')
      expect(dish.requiredCategories).toEqual(['hiragana'])
    }
  })

  it('all ids are unique', () => {
    const ids = RESTAURANT_DISHES.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every displayKana is valid plain hiragana only (no katakana, no kanji, no small っ/ゃゅょ)', () => {
    for (const dish of HIRAGANA_RESTAURANT_DISHES) {
      expect(isHiraganaOnly(dish.displayKana), `${dish.id}: "${dish.displayKana}" is not pure hiragana`).toBe(true)
      expect(dish.displayKana.includes(SMALL_TSU), `${dish.id} unexpectedly contains small っ`).toBe(false)
      for (const y of YOON) {
        expect(dish.displayKana.includes(y), `${dish.id} unexpectedly contains ${y}`).toBe(false)
      }
    }
  })

  it('matches the exact literal displayKana list from the spec (Issue #158 Restaurant 1 + Issue #160 hiragana-complete)', () => {
    const expected: Record<string, string> = {
      sushi: 'すし',
      udon: 'うどん',
      tonkatsu: 'とんかつ',
      katsudon: 'かつどん',
      oden: 'おでん',
      unagi: 'うなぎ',
      dango: 'だんご',
      tendon: 'てんどん',
      kaisendon: 'かいせんどん',
      unidon: 'うにどん',
      kani: 'かに',
      yakisoba: 'やきそば',
      okonomiyaki: 'おこのみやき',
      tamagoyaki: 'たまごやき',
      karaage: 'からあげ',
    }
    for (const [id, kana] of Object.entries(expected)) {
      const dish = HIRAGANA_RESTAURANT_DISHES.find((d) => d.id === id)
      expect(dish, `missing dish "${id}"`).toBeDefined()
      expect(dish!.displayKana).toBe(kana)
    }
    expect(HIRAGANA_RESTAURANT_DISHES).toHaveLength(Object.keys(expected).length)
  })

  it('no longer includes the removed later-kana dishes in the active pool (Issue #158)', () => {
    const removedIds = ['soba', 'tenpura', 'onigiri', 'yakitori', 'sashimi', 'edamame', 'misoshiru']
    const activeIds = HIRAGANA_RESTAURANT_DISHES.map((d) => d.id)
    for (const id of removedIds) expect(activeIds).not.toContain(id)
  })

  it('uses existing images when available and placeholders otherwise', () => {
    for (const dish of RESTAURANT_DISHES) expect(dish.placeholderEmoji.length).toBeGreaterThan(0)
    expect(RESTAURANT_DISHES.find((dish) => dish.id === 'sushi')?.image).toBe('word-icons/sa-sushi.webp')
  })

  it('has unique placeholder visuals among missing-image dishes in every stage (none currently missing — PR #164 image drop)', () => {
    for (const stage of ['hiragana', 'katakana', 'other', 'special-katakana'] as const) {
      const missing = RESTAURANT_DISHES.filter((dish) => dish.stage === stage && !dish.image).map((dish) => dish.placeholderEmoji)
      expect(new Set(missing).size).toBe(missing.length)
    }
  })

  it('references only existing public images and audio', () => {
    const withImage = RESTAURANT_DISHES.filter((item) => item.image)
    for (const dish of withImage) {
      expect(fs.existsSync(path.resolve(process.cwd(), 'public', dish.image!)), `${dish.id}: missing image ${dish.image}`).toBe(true)
    }
    // Every dish's audioPath must resolve to a real file — Issue #160
    // requires matching supplied local audio to approved ids and converting
    // it to the production .mp3 recipe rather than leaving a broken path.
    for (const dish of RESTAURANT_DISHES) {
      const relative = dish.audioPath.replace(/^\//, '')
      expect(fs.existsSync(path.resolve(process.cwd(), 'public', relative)), `${dish.id}: missing audio ${dish.audioPath}`).toBe(true)
    }
  })

  it('every dish has a non-empty placeholder emoji available as a fallback, even though none is currently missing an image (PR #164)', () => {
    for (const dish of RESTAURANT_DISHES) {
      expect(dish.placeholderEmoji.length).toBeGreaterThan(0)
      // Whether or not `image` is set, the placeholder must be ready for
      // DishGlyph's onError fallback (routes/games/RestaurantPage.tsx) —
      // a broken/missing image file still falls back to this at runtime.
    }
  })

  it('every missing-image placeholder is unique, so the target bubble is never ambiguous (none currently missing — PR #164)', () => {
    const emoji = HIRAGANA_RESTAURANT_DISHES.filter((d) => !d.image).map((d) => d.placeholderEmoji)
    expect(new Set(emoji).size).toBe(emoji.length)
  })

  it('every one of the 37 new dishes from Issue #160\'s checkpoint roadmap now has a real, resolvable illustration (PR #164 image drop)', () => {
    const newDishIds = [
      'katsudon', 'unagi', 'dango', 'tendon', 'kaisendon', 'unidon', 'kani', 'yakisoba', 'okonomiyaki', 'tamagoyaki', 'karaage',
      'kokoa', 'sooseeji', 'uisukii', 'toosuto', 'chiizu', 'doonatsu', 'chiizukeeki', 'pankeeki', 'teriyakichikin', 'furaidochikin', 'biiru', 'wain', 'haibooru',
      'waffuru', 'esupuresso', 'appurupai', 'soumen', 'kakigoori', 'yakitoumorokoshi', 'gyuudon', 'shuumai', 'kyuuri', 'koucha', 'nihonshu',
      'remontii', 'mineraruwootaa',
    ]
    expect(newDishIds).toHaveLength(37)
    for (const id of newDishIds) {
      const dish = RESTAURANT_DISHES.find((d) => d.id === id)
      expect(dish, `missing dish "${id}"`).toBeDefined()
      expect(dish!.image, `${id} should have a real image, not fall back to placeholder`).toBeDefined()
      expect(fs.existsSync(path.resolve(process.cwd(), 'public', dish!.image!)), `${id}: image ${dish!.image} does not exist`).toBe(true)
      expect(dish!.image).toBe(`restaurant-dishes/${dish!.stage}/${id}.webp`)
    }
  })

  it('has no duplicate image path across any two dishes (no source image reused for two production ids)', () => {
    const withImage = RESTAURANT_DISHES.filter((d) => d.image)
    const seen = new Map<string, string>()
    for (const dish of withImage) {
      const previousOwner = seen.get(dish.image!)
      expect(previousOwner, `${dish.image} is used by both "${previousOwner}" and "${dish.id}"`).toBeUndefined()
      seen.set(dish.image!, dish.id)
    }
  })

  // Issue #158: Restaurant 1 is a checkpoint placed right after な行, so every
  // one of its 11 dishes must be spellable using ONLY kana taught through
  // na-row under the post-Issue #155 curriculum (which folded ん into a-row
  // and dropped the standalone wa-row) — not any later row's kana.
  it('every dish is readable using only kana taught through na-row (Issue #158 checkpoint placement)', () => {
    const naRowCumulativeKana = new Set(
      getCumulativeCharacterIds('na-row').map((id) => CHARACTERS.find((c) => c.id === id)?.kana).filter((k): k is string => !!k),
    )
    expect(naRowCumulativeKana.size).toBeGreaterThan(0)
    const restaurant1Dishes = HIRAGANA_RESTAURANT_DISHES.filter((d) => d.checkpointId === 'na-row')
    for (const dish of restaurant1Dishes) {
      for (const ch of dish.displayKana) {
        expect(naRowCumulativeKana.has(ch), `${dish.id}: "${ch}" in "${dish.displayKana}" is not taught through na-row`).toBe(true)
      }
    }
  })

  it('leaves the pre-Issue-#160 katakana/other/special-katakana Restaurant dishes unaffected (Issue #158 baseline preserved)', () => {
    const preExisting = (id: string) => !RESTAURANT_DISHES.find((d) => d.id === id)?.checkpointId
    expect(KATAKANA_RESTAURANT_DISHES.filter((d) => preExisting(d.id)).map((d) => d.id)).toEqual([
      'karee', 'pasuta', 'sarada', 'piza', 'suupu', 'hanbaagaa', 'suteeki', 'poteto', 'raamen',
      'koohii', 'koora', 'miruku', 'purin', 'zerii', 'aisu', 'keeki',
    ])
    expect(OTHER_RESTAURANT_DISHES.filter((d) => preExisting(d.id)).map((d) => d.id)).toEqual([
      'hotto-doggu', 'sandoicchi', 'hanbaagaa-setto', 'korokke', 'kukkii', 'hotto-kokoa', 'toufu',
    ])
    expect(SPECIAL_KATAKANA_RESTAURANT_DISHES.filter((d) => preExisting(d.id)).map((d) => d.id)).toEqual([
      'chaahan', 'gyouza', 'shichuu', 'kaferate', 'mirukutii', 'orenji-juusu', 'ryokucha', 'pafe', 'tiramisu', 'choko-aisu',
    ])
  })

  it('renamed the pre-existing チキン dish to てりやきチキン (Issue #160 approved correction), not a duplicate', () => {
    expect(RESTAURANT_DISHES.find((d) => d.id === 'chikin')).toBeUndefined()
    const renamed = RESTAURANT_DISHES.find((d) => d.id === 'teriyakichikin')
    expect(renamed).toBeDefined()
    expect(renamed!.displayKana).toBe('てりやきチキン')
    // Originally reused チキン's illustration (Issue #160), but PR #164
    // supplied a dedicated てりやきチキン image, so it no longer reuses
    // chikin.webp — same for its already-dedicated audio recording.
    expect(renamed!.image).toBe('restaurant-dishes/katakana/teriyakichikin.webp')
    expect(renamed!.image).not.toBe('restaurant-dishes/katakana/chikin.webp')
    expect(renamed!.audioPath).toBe('/audio/restaurant/katakana/teriyakichikin.mp3')
    expect(renamed!.audioPath).not.toBe('/audio/restaurant/katakana/chikin.mp3')
  })

  it('the pre-existing チキン illustration (chikin.webp) still exists on disk but is no longer referenced by any dish (Issue #160 asset preservation)', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), 'public/restaurant-dishes/katakana/chikin.webp'))).toBe(true)
    expect(RESTAURANT_DISHES.some((d) => d.image === 'restaurant-dishes/katakana/chikin.webp')).toBe(false)
  })
})

describe('restaurantDishes (Issue #160 checkpoint roadmap)', () => {
  it('does not adopt きゃべつ or ウォッカ (final corrections)', () => {
    const ids = RESTAURANT_DISHES.map((d) => d.id)
    const kana = RESTAURANT_DISHES.map((d) => d.displayKana)
    expect(kana).not.toContain('きゃべつ')
    expect(kana).not.toContain('ウォッカ')
    expect(ids).not.toContain('kyabetsu')
    expect(ids).not.toContain('wokka')
  })

  it('adopts ミネラルウォーター for the final Special Katakana Cafe checkpoint', () => {
    const dish = RESTAURANT_DISHES.find((d) => d.id === 'mineraruwootaa')
    expect(dish).toBeDefined()
    expect(dish!.displayKana).toBe('ミネラルウォーター')
    expect(dish!.checkpointId).toBe('special-katakana-complete')
  })

  it('has exactly the five approved alcohol items, all in Restaurant (not Cafe)', () => {
    const alcoholIds = ['biiru', 'wain', 'uisukii', 'haibooru', 'nihonshu']
    for (const id of alcoholIds) {
      const dish = RESTAURANT_DISHES.find((d) => d.id === id)
      expect(dish, `missing alcohol item "${id}"`).toBeDefined()
      expect(CAFE_DISHES.find((d) => d.id === id), `${id} must not be a Cafe item`).toBeUndefined()
    }
    // No sixth alcohol item (e.g. a since-removed vodka) exists.
    const alcoholKana = ['ビール', 'ワイン', 'ウイスキー', 'ハイボール', 'にほんしゅ']
    const allAlcoholLike = RESTAURANT_DISHES.filter((d) => alcoholKana.includes(d.displayKana))
    expect(allAlcoholLike).toHaveLength(5)
  })

  it('every checkpoint id referenced by a dish exists in PRACTICE_CHECKPOINTS', () => {
    const checkpointIds = new Set(PRACTICE_CHECKPOINTS.map((c) => c.id))
    for (const dish of RESTAURANT_DISHES) {
      if (dish.checkpointId) expect(checkpointIds.has(dish.checkpointId), `${dish.id} references unknown checkpoint "${dish.checkpointId}"`).toBe(true)
    }
  })

  // Issue #166: `targetIntroductions` is hand-curated data (legacy dishes'
  // pedagogical first-introduction, or a deliberate cross-mode reuse — see
  // targetIntroductionsById's comment) rather than derived automatically, so
  // it needs its own integrity checks: every referenced checkpoint must be
  // real, and — the actual bug this issue fixes — the dish must genuinely be
  // readable at the checkpoint it's introduced for, not just share a stage
  // with it. Getting either of these wrong would silently reintroduce the
  // "kaferate/mirukutii targeted before ファ/ティ are taught" regression.
  describe('targetIntroductions integrity', () => {
    const PRACTICE_CHECKPOINT_IDS = new Set(PRACTICE_CHECKPOINTS.map((c) => c.id))
    const dishesWithIntroductions = RESTAURANT_DISHES.filter((d) => (d.targetIntroductions?.length ?? 0) > 0)

    it('has at least one dish with an explicit targetIntroductions override (this suite is not vacuous)', () => {
      expect(dishesWithIntroductions.length).toBeGreaterThan(0)
    })

    it.each(dishesWithIntroductions.flatMap((dish) => (dish.targetIntroductions ?? []).map((introduction) => ({ dish, introduction }))))(
      'dish "$dish.id" targetIntroductions entry references a real checkpoint and matches its mode',
      ({ dish, introduction }) => {
        const checkpoint = PRACTICE_CHECKPOINTS_BY_ID[introduction.checkpointId]
        expect(PRACTICE_CHECKPOINT_IDS.has(introduction.checkpointId), `${dish.id}: unknown checkpoint "${introduction.checkpointId}"`).toBe(true)
        expect(checkpoint?.mode, `${dish.id}: introduction mode "${introduction.mode}" does not match checkpoint "${introduction.checkpointId}"'s own mode`).toBe(introduction.mode)
      },
    )

    it.each(dishesWithIntroductions.flatMap((dish) => (dish.targetIntroductions ?? []).map((introduction) => ({ dish, introduction }))))(
      'dish "$dish.id" is actually readable at the checkpoint it is introduced for ("$introduction.checkpointId")',
      ({ dish, introduction }) => {
        const checkpoint = PRACTICE_CHECKPOINTS_BY_ID[introduction.checkpointId]
        if (!checkpoint) return
        const kanaSet = getReadableKana(checkpoint.afterRowId)
        expect(
          isFullyReadable(dish.displayKana, kanaSet),
          `${dish.id} ("${dish.displayKana}") is not readable using kana taught through "${checkpoint.afterRowId}" — it cannot be introduced this early`,
        ).toBe(true)
      },
    )

    it('never introduces a dish for a checkpoint earlier than any own-checkpoint spotlight it might also carry', () => {
      for (const dish of dishesWithIntroductions) {
        if (!dish.checkpointId) continue
        const ownOrder = PRACTICE_CHECKPOINTS.findIndex((c) => c.id === dish.checkpointId)
        for (const introduction of dish.targetIntroductions ?? []) {
          const introOrder = PRACTICE_CHECKPOINTS.findIndex((c) => c.id === introduction.checkpointId)
          if (introduction.mode === PRACTICE_CHECKPOINTS_BY_ID[dish.checkpointId]?.mode) {
            expect(introOrder, `${dish.id}: same-mode targetIntroductions entry must not precede its own checkpoint`).toBeGreaterThanOrEqual(ownOrder)
          }
        }
      }
    })
  })

  it('every Cafe checkpoint dish is Katakana-only (Cafe\'s own hard constraint)', () => {
    for (const dish of CAFE_DISHES) {
      expect(isKatakanaOnlyDish(dish), `${dish.id}: "${dish.displayKana}" is not Katakana-only`).toBe(true)
    }
  })

  // Learned-character readability at each checkpoint (Issue #160's
  // Acceptance Criteria) — every checkpoint's own NEW spotlight dishes must
  // be spellable using only kana cumulatively taught by that checkpoint's
  // row, unioned with all of hiragana when the checkpoint mixes scripts
  // (katakana rows don't declare a curriculum dependency on hiragana, but
  // hiragana is always fully taught before any katakana row is reached in
  // the app's fixed category order).
  const readabilityCases: { checkpointId: string; rowIds: string[] }[] = [
    { checkpointId: 'na-row', rowIds: ['na-row'] },
    { checkpointId: 'hiragana-complete', rowIds: ['ra-row'] },
    { checkpointId: 'katakana-sa-row', rowIds: ['katakana-sa-row'] },
    { checkpointId: 'katakana-ha-row', rowIds: ['katakana-ha-row'] },
    { checkpointId: 'katakana-complete', rowIds: ['katakana-ra-row', 'ra-row'] },
    { checkpointId: 'sokuon-complete', rowIds: ['sokuon-row'] },
    { checkpointId: 'chouon-complete', rowIds: ['chouon-katakana-row'] },
    { checkpointId: 'hiragana-youon-complete', rowIds: ['youon-ma-ra-row'] },
    { checkpointId: 'special-katakana-complete', rowIds: ['special-katakana-she-row'] },
  ]
  it.each(readabilityCases)('every new spotlight dish for checkpoint "$checkpointId" is readable using kana taught by then', ({ checkpointId, rowIds }) => {
    const kanaSet = readableKanaSet(rowIds)
    const spotlightDishes = RESTAURANT_DISHES.filter((d) => d.checkpointId === checkpointId)
    expect(spotlightDishes.length).toBeGreaterThan(0)
    for (const dish of spotlightDishes) {
      expect(isFullyReadable(dish.displayKana, kanaSet), `${dish.id}: "${dish.displayKana}" not readable by checkpoint "${checkpointId}"`).toBe(true)
    }
  })

  it('katakana-youon-complete has no forced new dishes (Issue #160: existing suitable items carry the checkpoint)', () => {
    expect(RESTAURANT_DISHES.filter((d) => d.checkpointId === 'katakana-youon-complete')).toHaveLength(0)
  })

  it('hiragana-complete does not pad beyond the 4 approved new items', () => {
    expect(RESTAURANT_DISHES.filter((d) => d.checkpointId === 'hiragana-complete').map((d) => d.id).sort()).toEqual(
      ['karaage', 'okonomiyaki', 'tamagoyaki', 'yakisoba'].sort(),
    )
  })

  it('katakana-sa-row has exactly the 3 approved new items', () => {
    expect(RESTAURANT_DISHES.filter((d) => d.checkpointId === 'katakana-sa-row').map((d) => d.id).sort()).toEqual(
      ['kokoa', 'sooseeji', 'uisukii'].sort(),
    )
  })

  it('katakana-ha-row (first Cafe checkpoint) has exactly the 5 approved new items', () => {
    expect(RESTAURANT_DISHES.filter((d) => d.checkpointId === 'katakana-ha-row').map((d) => d.id).sort()).toEqual(
      ['chiizu', 'chiizukeeki', 'doonatsu', 'pankeeki', 'toosuto'].sort(),
    )
  })

  it('katakana-complete has exactly the approved new items plus the renamed teriyaki chicken', () => {
    expect(RESTAURANT_DISHES.filter((d) => d.checkpointId === 'katakana-complete').map((d) => d.id).sort()).toEqual(
      ['biiru', 'furaidochikin', 'haibooru', 'teriyakichikin', 'wain'].sort(),
    )
  })

  it('sokuon-complete has exactly the 3 approved new Cafe items, not カップケーキ', () => {
    const ids = RESTAURANT_DISHES.filter((d) => d.checkpointId === 'sokuon-complete').map((d) => d.id).sort()
    expect(ids).toEqual(['appurupai', 'esupuresso', 'waffuru'].sort())
    expect(RESTAURANT_DISHES.map((d) => d.displayKana)).not.toContain('カップケーキ')
  })

  it('chouon-complete has exactly the 3 approved new items', () => {
    expect(RESTAURANT_DISHES.filter((d) => d.checkpointId === 'chouon-complete').map((d) => d.id).sort()).toEqual(
      ['kakigoori', 'soumen', 'yakitoumorokoshi'].sort(),
    )
  })

  it('hiragana-youon-complete has exactly the 5 approved new items, not きゃべつ/おちゃ', () => {
    const ids = RESTAURANT_DISHES.filter((d) => d.checkpointId === 'hiragana-youon-complete').map((d) => d.id).sort()
    expect(ids).toEqual(['gyuudon', 'koucha', 'kyuuri', 'nihonshu', 'shuumai'].sort())
    expect(RESTAURANT_DISHES.map((d) => d.displayKana)).not.toContain('おちゃ')
  })

  it('special-katakana-complete has exactly the 2 final approved new Cafe items', () => {
    expect(RESTAURANT_DISHES.filter((d) => d.checkpointId === 'special-katakana-complete').map((d) => d.id).sort()).toEqual(
      ['mineraruwootaa', 'remontii'].sort(),
    )
  })
})
