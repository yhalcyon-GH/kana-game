import { describe, expect, it } from 'vitest'
import { SCRIPT_ENTRY_POINTS } from './scriptEntryPoints'

// HomePage and NavBar both render this single shared array, so asserting
// order here (rather than duplicating the same order check in both routes'
// own test files) is enough to cover both.
describe('SCRIPT_ENTRY_POINTS top-level order (2026-08-26)', () => {
  it('is Hiragana -> Katakana -> Stop & Long Sound -> Yōon', () => {
    expect(SCRIPT_ENTRY_POINTS.map((e) => e.english)).toEqual(['Hiragana', 'Katakana', 'Stop & Long Sound', 'Yōon'])
  })

  // Special Katakana (see curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID) is
  // presented as a continuation of the SAME /youon page — no new top-level
  // entry/card/NavBar item — so it's folded into the EXISTING Yōon entry's
  // categoryIds instead of adding a 5th array element.
  it('stays exactly 4 entries — Special Katakana does not add a 5th top-level entry', () => {
    expect(SCRIPT_ENTRY_POINTS).toHaveLength(4)
  })

  it('the Yōon entry\'s categoryIds also cover Special Katakana, so it stays the Recommended card once the target moves there', () => {
    const youon = SCRIPT_ENTRY_POINTS.find((e) => e.english === 'Yōon')!
    expect(youon.categoryIds).toEqual(expect.arrayContaining(['youon', 'special-katakana']))
  })
})
