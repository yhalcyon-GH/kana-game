import { describe, expect, it } from 'vitest'
import { getScreenSizeCategory } from './screenSizeCategory'

describe('getScreenSizeCategory', () => {
  it('categorizes widths at and below 640 as small', () => {
    expect(getScreenSizeCategory(320)).toBe('small')
    expect(getScreenSizeCategory(640)).toBe('small')
  })

  it('categorizes widths between 641 and 1024 as medium', () => {
    expect(getScreenSizeCategory(641)).toBe('medium')
    expect(getScreenSizeCategory(1024)).toBe('medium')
  })

  it('categorizes widths above 1024 as large', () => {
    expect(getScreenSizeCategory(1025)).toBe('large')
    expect(getScreenSizeCategory(1920)).toBe('large')
  })
})
