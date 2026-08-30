import { describe, expect, it } from 'vitest'
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

  it('no dish has an image set yet (placeholders only, per spec)', () => {
    for (const dish of RESTAURANT_DISHES) {
      expect(dish.image).toBeUndefined()
      expect(dish.placeholderEmoji.length).toBeGreaterThan(0)
    }
  })
})
