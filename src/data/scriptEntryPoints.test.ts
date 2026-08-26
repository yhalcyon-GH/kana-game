import { describe, expect, it } from 'vitest'
import { SCRIPT_ENTRY_POINTS } from './scriptEntryPoints'

// HomePage and NavBar both render this single shared array, so asserting
// order here (rather than duplicating the same order check in both routes'
// own test files) is enough to cover both.
describe('SCRIPT_ENTRY_POINTS top-level order (2026-08-26)', () => {
  it('is Hiragana -> Katakana -> Stop & Long Sound -> Yōon', () => {
    expect(SCRIPT_ENTRY_POINTS.map((e) => e.english)).toEqual(['Hiragana', 'Katakana', 'Stop & Long Sound', 'Yōon'])
  })
})
