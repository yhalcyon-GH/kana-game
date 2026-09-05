import { describe, expect, it } from 'vitest'
import { ACCENT_PATTERNS } from './accents'
import { WORDS_BY_ROW } from './words'
import { toMorae } from '../lib/mora'
import { hashAccentTable } from '../../scripts/accentBaselineHash.mjs'

// The exact approved-baseline hash pinned in scripts/checkAccentData.mjs —
// duplicated here (not imported from the script, which is a standalone
// .mjs entrypoint, not a module meant to export its own constants) so this
// test fails loudly if that script's pinned hash and this test's ever
// diverge, same as the 298-count duplication below.
const APPROVED_TABLE_HASH = '1a292b0884b39469ab381d5491a509fec86e0d615a8793e2082ad46c2e2e7dc2'

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

// Whole-table baseline hash — proves the SAME mechanism
// scripts/checkAccentData.mjs uses would actually catch a change to ANY
// entry, not just the two spot-checked values above. Mutates an in-memory
// COPY of ACCENT_PATTERNS only; the real src/data/accents.ts is never
// touched by this test.
describe('accents: whole-table baseline hash', () => {
  it('the current table matches the approved baseline hash', () => {
    expect(hashAccentTable(ACCENT_PATTERNS)).toBe(APPROVED_TABLE_HASH)
  })

  it('changing a single H/L value on an ordinary (non-pinned) entry changes the hash', () => {
    // 'a-ai' is an ordinary entry with no dedicated spot-check test of its
    // own above — proving the hash catches a change here, not just to the
    // two specifically-pinned ids, is the actual point of this test.
    const mutated = { ...ACCENT_PATTERNS, 'a-ai': ACCENT_PATTERNS['a-ai'] === 'HL' ? 'LH' : 'HL' }
    expect(hashAccentTable(mutated)).not.toBe(APPROVED_TABLE_HASH)
  })

  it('renaming an id changes the hash', () => {
    const mutated = { ...ACCENT_PATTERNS }
    const value = mutated['a-ai']
    delete mutated['a-ai']
    mutated['a-ai-renamed'] = value
    expect(hashAccentTable(mutated)).not.toBe(APPROVED_TABLE_HASH)
  })

  it('removing an entry changes the hash', () => {
    const mutated = { ...ACCENT_PATTERNS }
    delete mutated['a-ai']
    expect(hashAccentTable(mutated)).not.toBe(APPROVED_TABLE_HASH)
  })

  it('adding an entry changes the hash', () => {
    const mutated = { ...ACCENT_PATTERNS, 'not-a-real-word-id': 'HL' }
    expect(hashAccentTable(mutated)).not.toBe(APPROVED_TABLE_HASH)
  })
})
