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
import { PRACTICE_CHECKPOINTS } from './practiceCheckpoints'

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

  it('has unique placeholder visuals among missing-image dishes in every stage', () => {
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

  it('every dish without an `image` falls back to its placeholder emoji (pending art — Issue #158 + #160)', () => {
    for (const dish of RESTAURANT_DISHES) {
      if (!dish.image) expect(dish.placeholderEmoji.length).toBeGreaterThan(0)
    }
  })

  it('every missing-image placeholder is unique, so the target bubble is never ambiguous', () => {
    const emoji = HIRAGANA_RESTAURANT_DISHES.filter((d) => !d.image).map((d) => d.placeholderEmoji)
    expect(new Set(emoji).size).toBe(emoji.length)
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
    expect(renamed!.image).toBe('restaurant-dishes/katakana/chikin.webp')
    expect(renamed!.audioPath).toBe('/audio/restaurant/katakana/chikin.mp3')
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
