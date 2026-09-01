import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  HIRAGANA_RESTAURANT_DISHES,
  KATAKANA_RESTAURANT_DISHES,
  OTHER_RESTAURANT_DISHES,
  RESTAURANT_DISHES,
  SPECIAL_KATAKANA_RESTAURANT_DISHES,
} from './restaurantDishes'
import { CHARACTERS } from './characters'
import { getCumulativeCharacterIds } from './curriculum'

const SMALL_TSU = 'っ'
const YOON = ['ゃ', 'ゅ', 'ょ']

function isHiraganaOnly(text: string): boolean {
  return [...text].every((ch) => ch >= 'ぁ' && ch <= 'ゖ')
}

describe('restaurantDishes (hiragana stage)', () => {
  it('has exactly 11 hiragana dishes', () => {
    expect(HIRAGANA_RESTAURANT_DISHES).toHaveLength(11)
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

  it('matches the exact literal displayKana list from the spec (Issue #158 Restaurant 1)', () => {
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
    // Their existing binary assets are intentionally left in place on disk
    // (public/restaurant-dishes/hiragana/*.webp, public/audio/restaurant/
    // hiragana/*.wav) for a later Restaurant checkpoint to reuse — this only
    // asserts they're no longer part of the active menu/target pool.
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

  it('references only existing public images', () => {
    expect(RESTAURANT_DISHES).toHaveLength(45)
    // 7 of the 45 dishes are Restaurant 1's new dishes (Issue #158) whose
    // real art the user is still producing separately — see restaurantDishes
    // .ts's PENDING_ASSET_IDS comment. Every dish that DOES claim an `image`
    // must point at a file that really exists; the 7 pending ones are
    // covered by the "pending" test below instead of asserting a fake path
    // here.
    const withImage = RESTAURANT_DISHES.filter((item) => item.image)
    expect(withImage).toHaveLength(38)
    for (const dish of withImage) {
      expect(fs.existsSync(path.resolve(process.cwd(), 'public', dish.image!))).toBe(true)
    }
  })

  it('Restaurant 1\'s 7 new dishes have no `image` yet, so they fall back to their placeholder emoji until the user\'s art lands (Issue #158)', () => {
    const pendingIds = ['katsudon', 'unagi', 'dango', 'tendon', 'kaisendon', 'unidon', 'kani']
    for (const id of pendingIds) {
      const dish = HIRAGANA_RESTAURANT_DISHES.find((d) => d.id === id)
      expect(dish, `missing dish "${id}"`).toBeDefined()
      expect(dish!.image).toBeUndefined()
      expect(dish!.placeholderEmoji.length).toBeGreaterThan(0)
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
    for (const dish of HIRAGANA_RESTAURANT_DISHES) {
      for (const ch of dish.displayKana) {
        expect(naRowCumulativeKana.has(ch), `${dish.id}: "${ch}" in "${dish.displayKana}" is not taught through na-row`).toBe(true)
      }
    }
  })

  // Issue #158 only touches the Hiragana stage's active pool — every other
  // stage's dish list/ids must come through completely untouched.
  it('leaves the katakana/other/special-katakana Restaurant pools unaffected (Issue #158)', () => {
    expect(KATAKANA_RESTAURANT_DISHES.map((d) => d.id)).toEqual([
      'karee', 'pasuta', 'sarada', 'piza', 'suupu', 'hanbaagaa', 'suteeki', 'poteto', 'chikin', 'raamen',
      'koohii', 'koora', 'miruku', 'purin', 'zerii', 'aisu', 'keeki',
    ])
    expect(OTHER_RESTAURANT_DISHES.map((d) => d.id)).toEqual([
      'hotto-doggu', 'sandoicchi', 'hanbaagaa-setto', 'korokke', 'kukkii', 'hotto-kokoa', 'toufu',
    ])
    expect(SPECIAL_KATAKANA_RESTAURANT_DISHES.map((d) => d.id)).toEqual([
      'chaahan', 'gyouza', 'shichuu', 'kaferate', 'mirukutii', 'orenji-juusu', 'ryokucha', 'pafe', 'tiramisu', 'choko-aisu',
    ])
  })
})
