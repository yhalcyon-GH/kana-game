import { describe, expect, it } from 'vitest'
import { getNextGlobalRealRow } from './curriculumNavigation'

describe('getNextGlobalRealRow', () => {
  it('moves to the next row inside a category', () => {
    expect(getNextGlobalRealRow('na-row')?.id).toBe('ha-row')
  })

  it('crosses from the final Hiragana row into the first Katakana row', () => {
    expect(getNextGlobalRealRow('ra-row')).toMatchObject({ id: 'katakana-a-row', categoryId: 'katakana' })
  })

  it('skips summary and Similar Letters rows', () => {
    expect(getNextGlobalRealRow('katakana-ra-row')?.id).toBe('sokuon-row')
  })

  it('returns null after the final real curriculum row', () => {
    expect(getNextGlobalRealRow('special-katakana-she-row')).toBeNull()
  })
})
