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

// Pinned as part of the 2026-09 commercial-release pitch-accent audit — see
// docs/pitch-accent-provenance.md. This is the current 'ra-mizu-wo-nomu' id
// (the word moved into the combined ra-row); the pipeline's old
// 'wa-mizu-wo-nomu' id is asserted gone entirely by curriculum.test.ts's
// stale-id guard.
describe('accents: ra-mizu-wo-nomu', () => {
  it('uses the approved LHHHL pattern for みずをのむ', () => {
    expect(ACCENT_PATTERNS['ra-mizu-wo-nomu']).toBe('LHHHL')
  })
})

// The full approved table's size is also checked by
// scripts/checkAccentData.mjs (which also verifies coverage, H/L shape, and
// mora-length match without any network access) — this is a lighter, fast
// in-suite guard that npm test alone still catches an accidental bulk
// change to the table.
describe('accents: approved table size', () => {
  it('has exactly 298 entries (the 2026-09 commercial-release audit baseline)', () => {
    expect(Object.keys(ACCENT_PATTERNS)).toHaveLength(298)
  })
})
