import { describe, expect, it } from 'vitest'
import { readCheckoutPromoCode } from './promoCode'

describe('readCheckoutPromoCode', () => {
  it.each([
    ['', undefined],
    ['?other=value', undefined],
    ['?promo=', undefined],
    ['?promo=bad-code', undefined],
    ['?promo=bad%20code', undefined],
    [`?promo=${'a'.repeat(33)}`, undefined],
    ['?promo=tamamizu0304', 'tamamizu0304'],
    ['?promo=FREE2026', 'FREE2026'],
    ['?promo=%20FREE2026%20', 'FREE2026'],
  ])('parses %s as %s', (search, expected) => {
    expect(readCheckoutPromoCode(new URLSearchParams(search))).toBe(expected)
  })
})
