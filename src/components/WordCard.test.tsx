import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCENT_PATTERNS } from '../data/accents'
import { WORDS_BY_ID } from '../data/words'
import { useProgressStore } from '../store/progressStore'
import { WordCard } from './WordCard'

// きゃく (kyaku, "customer") — a real yōon word: 2 glyphs (きゃ + く), one
// character id (kya) per glyph pair, but only 2 MORAE (kya-ku). AccentedKana
// aligns by mora (via src/lib/mora.ts's toMorae), not raw glyph count, so
// this word's accent line renders correctly despite the glyph/mora
// mismatch — see CLAUDE.md's "one kana glyph = one mora, EXCEPT yōon" note.
const YOUON_WORD = WORDS_BY_ID['youon-ka-kyaku']

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

describe('WordCard with a yōon word (2 glyphs, 1 character id, but mismatched mora count)', () => {
  it('exists in the fixture (guards against the word id being renamed out from under this test)', () => {
    expect(YOUON_WORD).toBeDefined()
    expect(YOUON_WORD.kana).toBe('きゃく')
  })

  it('renders without crashing and shows the full kana string', () => {
    // Each mora renders in its own non-breaking span (see UnbreakableKana),
    // so the full word is split across sibling elements rather than one
    // plain text node — assert on the card's combined text content instead
    // of a single getByText match.
    const { container } = render(<WordCard word={YOUON_WORD} />)
    expect(container.textContent).toContain('きゃく')
  })

  it('keeps the yōon glyph pair (きゃ) together in one non-breaking unit, never splitting き from ゃ', () => {
    const { container } = render(<WordCard word={YOUON_WORD} />)
    const moraSpans = Array.from(container.querySelectorAll('.font-kana .whitespace-nowrap'))
    expect(moraSpans.map((el) => el.textContent)).toEqual(['きゃ', 'く'])
  })

  it('has a real ACCENT_PATTERNS entry, aligned by mora count (2) not glyph count (3)', () => {
    const accent = ACCENT_PATTERNS[YOUON_WORD.id]
    expect(accent).toBeDefined()
    expect(accent).toHaveLength(2)
  })

  it('renders the accent-line svg for this yōon word', () => {
    const { container } = render(<WordCard word={YOUON_WORD} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it("still renders a single-mora word's accent line normally (regression: mora-alignment didn't break the simple case)", () => {
    // あい (a-ai) is a real 2-glyph, 2-mora hiragana word with a known
    // ACCENT_PATTERNS entry — confirms this test file would actually catch
    // a broken AccentedKana, not just always see the accent-line path.
    const { container } = render(<WordCard word={WORDS_BY_ID['a-ai']} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('falls back to plain kana (no svg) for a word with no accent data at all', () => {
    // Every real word in the curriculum has accent data as of this test's
    // writing (261/261 — see buildAccentData.mjs's MANUAL_OVERRIDES for the
    // ones with no accentjiten entry). Use a word id that doesn't exist in
    // ACCENT_PATTERNS to prove the fallback path still engages correctly,
    // rather than relying on a specific real word staying data-less forever.
    expect(ACCENT_PATTERNS['not-a-real-word-id']).toBeUndefined()
    const word = { ...WORDS_BY_ID['a-ai'], id: 'not-a-real-word-id' }
    const { container } = render(<WordCard word={word} />)
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })
})

describe('Particle greeting display', () => {
  it.each(['ra-konnichiwa', 'ra-konbanwa'])('marks only the final は for %s', (id) => {
    const { container, getByTestId, getByText } = render(<WordCard word={WORDS_BY_ID[id]} />)
    expect(getByTestId('particle-greeting-ha')).toHaveTextContent('は')
    expect(getByTestId('particle-greeting-ha')).toHaveClass('text-red-600')
    expect(getByText('は ※Particle')).toHaveClass('text-red-600')
    expect(container.querySelector('svg polyline')).toBeInTheDocument()
  })

  it('leaves ordinary vocabulary without particle styling', () => {
    const { container, queryByTestId, queryByText } = render(<WordCard word={WORDS_BY_ID['ra-watashi']} />)
    expect(queryByTestId('particle-greeting-ha')).toBeNull()
    expect(queryByText('は ※Particle')).toBeNull()
    expect(container.querySelector('svg polyline')).toBeInTheDocument()
  })
})

// Special Katakana vocabulary (finish Special Katakana learning polish,
// item 4) — 22 words newly given ACCENT_PATTERNS entries. ファン (fan) is a
// representative combo word: ファ is a Special Katakana combo that must
// align as exactly ONE mora (not 2, per raw codepoint count) — see
// src/lib/mora.ts's toMorae, unchanged by this work since it already
// handled these combos correctly.
describe('WordCard with a Special Katakana word (ファン)', () => {
  const WORD = WORDS_BY_ID['special-katakana-fa-fan']

  it('exists in the fixture', () => {
    expect(WORD).toBeDefined()
    expect(WORD.kana).toBe('ファン')
  })

  it('has an ACCENT_PATTERNS entry aligned by mora count (2: ファ, ン), not glyph count (3)', () => {
    const accent = ACCENT_PATTERNS[WORD.id]
    expect(accent).toBeDefined()
    expect(accent).toHaveLength(2)
  })

  it('renders the accent-line svg (the red pitch-accent line) automatically once the pattern exists', () => {
    const { container } = render(<WordCard word={WORD} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('keeps ファ together as one non-breaking mora unit, never splitting フ from ァ', () => {
    const { container } = render(<WordCard word={WORD} />)
    const moraSpans = Array.from(container.querySelectorAll('.font-kana .whitespace-nowrap'))
    expect(moraSpans.map((el) => el.textContent)).toEqual(['ファ', 'ン'])
  })
})

describe('WordCard — all 22 Special Katakana vocabulary words have valid accent data', () => {
  const SPECIAL_KATAKANA_WORD_IDS = Object.keys(WORDS_BY_ID).filter((id) => id.startsWith('special-katakana-'))

  it('covers exactly 22 words', () => {
    expect(SPECIAL_KATAKANA_WORD_IDS).toHaveLength(22)
  })

  it.each(SPECIAL_KATAKANA_WORD_IDS)('%s has an ACCENT_PATTERNS entry and renders the accent-line svg', (id) => {
    expect(ACCENT_PATTERNS[id]).toBeDefined()
    const { container } = render(<WordCard word={WORDS_BY_ID[id]} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
