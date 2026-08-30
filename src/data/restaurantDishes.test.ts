import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { HIRAGANA_RESTAURANT_DISHES, RESTAURANT_DISHES } from './restaurantDishes'

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

  it('matches the exact literal displayKana list from the spec', () => {
    const expected: Record<string, string> = {
      sushi: 'すし',
      soba: 'そば',
      udon: 'うどん',
      tenpura: 'てんぷら',
      onigiri: 'おにぎり',
      yakitori: 'やきとり',
      sashimi: 'さしみ',
      tonkatsu: 'とんかつ',
      oden: 'おでん',
      edamame: 'えだまめ',
      misoshiru: 'みそしる',
    }
    for (const [id, kana] of Object.entries(expected)) {
      const dish = HIRAGANA_RESTAURANT_DISHES.find((d) => d.id === id)
      expect(dish, `missing dish "${id}"`).toBeDefined()
      expect(dish!.displayKana).toBe(kana)
    }
    expect(HIRAGANA_RESTAURANT_DISHES).toHaveLength(Object.keys(expected).length)
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
    for (const dish of RESTAURANT_DISHES.filter((item) => item.image)) {
      expect(fs.existsSync(path.resolve(process.cwd(), 'public', dish.image!))).toBe(true)
    }
  })

  it('every missing-image placeholder is unique, so the target bubble is never ambiguous', () => {
    const emoji = HIRAGANA_RESTAURANT_DISHES.filter((d) => !d.image).map((d) => d.placeholderEmoji)
    expect(new Set(emoji).size).toBe(emoji.length)
  })
})
