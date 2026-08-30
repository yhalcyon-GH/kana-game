import { describe, expect, it } from 'vitest'
import { HIRAGANA_RESTAURANT_DISHES, RESTAURANT_DISHES } from '../data/restaurantDishes'
import { checkMultipleDishOrder, checkMultipleDishOrderAlternatives, checkOrder, checkOrderAlternatives, hasOrderIntent, identifyDish, normalizeJapanese } from './restaurantMatching'

const sushi = HIRAGANA_RESTAURANT_DISHES.find((d) => d.id === 'sushi')!
const soba = HIRAGANA_RESTAURANT_DISHES.find((d) => d.id === 'soba')!
const udon = HIRAGANA_RESTAURANT_DISHES.find((d) => d.id === 'udon')!
const oden = HIRAGANA_RESTAURANT_DISHES.find((d) => d.id === 'oden')!
const menu = [sushi, soba, udon, oden]
const chocoAisu = RESTAURANT_DISHES.find((d) => d.id === 'choko-aisu')!
const aisu = RESTAURANT_DISHES.find((d) => d.id === 'aisu')!
const shichuu = RESTAURANT_DISHES.find((d) => d.id === 'shichuu')!
const pafe = RESTAURANT_DISHES.find((d) => d.id === 'pafe')!
const hamburger = RESTAURANT_DISHES.find((d) => d.id === 'hanbaagaa')!
const hamburgerSet = RESTAURANT_DISHES.find((d) => d.id === 'hanbaagaa-setto')!

describe('normalizeJapanese', () => {
  it('strips whitespace and punctuation', () => {
    expect(normalizeJapanese('すみません、すし、おねがいします。')).toBe('すみませんすしおねがいします')
  })

  it('normalizes katakana to hiragana', () => {
    expect(normalizeJapanese('スシ')).toBe(normalizeJapanese('すし'))
  })
})

describe('hasOrderIntent', () => {
  it('accepts おねがいします and お願いします and ください and 下さい', () => {
    expect(hasOrderIntent(normalizeJapanese('おねがいします'))).toBe(true)
    expect(hasOrderIntent(normalizeJapanese('お願いします'))).toBe(true)
    expect(hasOrderIntent(normalizeJapanese('ください'))).toBe(true)
    expect(hasOrderIntent(normalizeJapanese('下さい'))).toBe(true)
  })

  it('rejects a transcript with no order-intent phrase', () => {
    expect(hasOrderIntent(normalizeJapanese('すし'))).toBe(false)
  })
})

describe('identifyDish (longest-match-first)', () => {
  it('matches a kanji alias', () => {
    expect(identifyDish(normalizeJapanese('寿司'), menu)?.id).toBe('sushi')
  })

  it('does not let a short alias shadow a different, longer alias', () => {
    // そば's alias 'そば' is not a substring of any other menu alias here,
    // but exercise the longest-first ordering directly via a synthetic
    // candidate set to guard the sort behavior itself.
    const candidates = [
      { ...sushi, id: 'short', recognitionAliases: ['そ'] },
      { ...soba, id: 'long', recognitionAliases: ['そば'] },
    ]
    expect(identifyDish(normalizeJapanese('そば'), candidates)?.id).toBe('long')
  })

  it('returns null when nothing in the transcript matches any candidate', () => {
    expect(identifyDish(normalizeJapanese('てんぷら'), menu)).toBeNull()
  })
})

describe('checkOrder', () => {
  it('succeeds for "すみません、すしをおねがいします。" when すし is the target', () => {
    expect(checkOrder('すみません、すし、おねがいします。', menu, sushi).outcome).toBe('success')
  })

  it('accepts すいません as well as すみません', () => {
    expect(checkOrder('すいません、すし、おねがいします。', menu, sushi).outcome).toBe('success')
  })

  it('succeeds even when すみません/すいません is omitted entirely', () => {
    const result = checkOrder('すしお願いします', menu, sushi)
    expect(result.outcome).toBe('success')
  })

  it('tolerates spacing/punctuation variation', () => {
    expect(checkOrder('すし　お願いします！', menu, sushi).outcome).toBe('success')
  })

  it('matches via kanji aliases (天ぷら etc.)', () => {
    const tenpura = { ...udon, id: 'tenpura', recognitionAliases: ['てんぷら', '天ぷら', '天麩羅'] }
    expect(checkOrder('天ぷらお願いします', [tenpura], tenpura).outcome).toBe('success')
  })

  it('fails explicitly (wrong-dish) when a different displayed dish is named than the target', () => {
    const result = checkOrder('そばお願いします', menu, sushi)
    expect(result.outcome).toBe('wrong-dish')
    if (result.outcome === 'wrong-dish') expect(result.identified.id).toBe('soba')
  })

  it('succeeds on a dish name alone without an order-intent phrase', () => {
    expect(checkOrder('すし', menu, sushi).outcome).toBe('success')
  })

  it('does not succeed on an order-intent phrase alone with no dish named', () => {
    expect(checkOrder('おねがいします', menu, sushi).outcome).toBe('unrecognized')
  })
})

describe('checkOrderAlternatives', () => {
  it('succeeds if the first alternative fails but the second or third is a valid order', () => {
    const alternatives = ['garbage transcript', 'そばです', 'すしお願いします']
    const result = checkOrderAlternatives(alternatives, menu, sushi)
    expect(result.outcome).toBe('success')
  })

  it('only checks up to 3 alternatives', () => {
    const alternatives = ['garbage', 'garbage', 'garbage', 'すしお願いします']
    const result = checkOrderAlternatives(alternatives, menu, sushi)
    expect(result.outcome).toBe('unrecognized')
  })

  it('prefers a wrong displayed dish over an earlier unrecognized alternative', () => {
    expect(checkOrderAlternatives(['noise', 'そば'], menu, sushi)).toEqual({ outcome: 'wrong-dish', identified: soba })
  })

  it('prefers success from any of the first three alternatives', () => {
    expect(checkOrderAlternatives(['noise', 'そば', 'すし'], menu, sushi).outcome).toBe('success')
  })
})

describe('checkMultipleDishOrder', () => {
  it('succeeds when targets A and B are named in menu order', () => {
    expect(checkMultipleDishOrder('すし と そば', menu, [sushi, soba]).outcome).toBe('success')
  })

  it('succeeds when targets A and B are named in reverse order', () => {
    expect(checkMultipleDishOrder('そば と すし', menu, [sushi, soba]).outcome).toBe('success')
  })

  it('fails when only one of the two targets is named', () => {
    expect(checkMultipleDishOrder('すし', menu, [sushi, soba]).outcome).not.toBe('success')
  })

  it('fails when both targets and another displayed dish are named', () => {
    expect(checkMultipleDishOrder('すし と そば と うどん', menu, [sushi, soba]).outcome).not.toBe('success')
  })

  it('checks up to three speech-recognition alternatives for a two-dish order', () => {
    expect(checkMultipleDishOrderAlternatives(['noise', 'すし', 'そば と すし'], menu, [sushi, soba]).outcome).toBe('success')
  })

  it('matches チョコアイス and シチュー without counting the アイ ス substring twice', () => {
    expect(checkMultipleDishOrder('チョコアイスとシチューお願いします', [chocoAisu, aisu, shichuu, pafe], [chocoAisu, shichuu]).outcome).toBe('success')
  })

  it('accepts the reverse order for the collision-prone pair', () => {
    expect(checkMultipleDishOrder('シチューとチョコアイスお願いします', [chocoAisu, aisu, shichuu, pafe], [chocoAisu, shichuu]).outcome).toBe('success')
  })

  it('rejects アイスとシチュー when チョコアイス is the target', () => {
    expect(checkMultipleDishOrder('アイスとシチューお願いします', [chocoAisu, aisu, shichuu, pafe], [chocoAisu, shichuu]).outcome).toBe('wrong-dish')
  })

  it('rejects a target pair when a third dish is explicitly spoken', () => {
    expect(checkMultipleDishOrder('チョコアイスとシチューとパフェお願いします', [chocoAisu, aisu, shichuu, pafe], [chocoAisu, shichuu]).outcome).toBe('wrong-dish')
  })

  it('prefers ハンバーガーセット over the shorter ハンバーガー alias', () => {
    expect(checkMultipleDishOrder('ハンバーガーセットとシチュー', [hamburger, hamburgerSet, shichuu], [hamburgerSet, shichuu]).outcome).toBe('success')
  })

  it('keeps single-dish matching correct with overlapping aliases', () => {
    expect(checkOrder('チョコアイスお願いします', [chocoAisu, aisu], chocoAisu).outcome).toBe('success')
    expect(checkOrder('アイスお願いします', [chocoAisu, aisu], aisu).outcome).toBe('success')
  })
})
