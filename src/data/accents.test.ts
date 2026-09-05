import { describe, expect, it } from 'vitest'
import { ACCENT_PATTERNS } from './accents'
import { WORDS_BY_ROW } from './words'
import { toMorae } from '../lib/mora'

// Focused check for the こんにちは/こんばんは greetings (moved from the
// deleted wa-row into the final combined ra-row — Issue #155): both are
// heiban (accent pattern 0 — pitch rises after mora 1 and never drops),
// which the H/L string represents as L followed by all H. This also guards
// that the accent string's length always matches the word's real mora
// count (via toMorae, the same mora-splitter WordCard uses to draw the
// line), not just its character count.
describe('accents: ra-konnichiwa / ra-konbanwa', () => {
  const words = WORDS_BY_ROW['ra-row']

  it.each(['ra-konnichiwa', 'ra-konbanwa'])('%s has an accent pattern with mora count matching toMorae(kana)', (id) => {
    const word = words.find((w) => w.id === id)
    expect(word).toBeDefined()
    const pattern = ACCENT_PATTERNS[id]
    expect(pattern).toBeDefined()
    const morae = toMorae(word!.kana)
    expect(pattern!.length).toBe(morae.length)
  })

  it.each(['ra-konnichiwa', 'ra-konbanwa'])('%s is heiban: low first mora, high for the rest', (id) => {
    const pattern = ACCENT_PATTERNS[id]
    expect(pattern![0]).toBe('L')
    expect(pattern!.slice(1)).toBe('H'.repeat(pattern!.length - 1))
  })
})

describe('accents: special-katakana-she-harowin', () => {
  it('uses the verified HLLL pattern for ハロウィン', () => {
    expect(ACCENT_PATTERNS['special-katakana-she-harowin']).toBe('HLLL')
  })
})
