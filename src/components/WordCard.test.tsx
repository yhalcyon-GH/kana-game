import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCENT_PATTERNS } from '../data/accents'
import { WORDS_BY_ID } from '../data/words'
import { useProgressStore } from '../store/progressStore'
import { WordCard } from './WordCard'

// きゃく (kyaku, "customer") — a real yōon word: 2 glyphs (きゃ + く), one
// character id (kya) per glyph pair, but only 2 MORAE (kya-ku). Real hiragana
// content proving AccentedKana's documented fallback (see WordCard.tsx) is
// actually safe, not just theoretically so — see the CLAUDE.md/
// docs/curriculum-extensibility.md note on yōon breaking the "one glyph =
// one mora" assumption pitch-accent rendering relies on.
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
    render(<WordCard word={YOUON_WORD} />)
    expect(screen.getByText('きゃく')).toBeInTheDocument()
  })

  it('has no ACCENT_PATTERNS entry — buildAccentData.mjs\'s length-mismatch guard drops it', () => {
    // The dataset's accent is per-MORA (2 long: kya-ku), but [...kana] in
    // WordCard.tsx is per-GLYPH (3 long: き/ゃ/く) — buildAccentData.mjs
    // already drops any entry where those lengths disagree rather than
    // writing a misaligned one (see its "WARNING — length mismatches"
    // console output). Confirms there's genuinely no accent data on file to
    // misrender for this word, not just that AccentedKana would fall back
    // safely if there somehow were.
    expect(ACCENT_PATTERNS[YOUON_WORD.id]).toBeUndefined()
  })

  it('renders no accent-line svg (the mismatch fallback plain-kana path, not the accent-line path)', () => {
    const { container } = render(<WordCard word={YOUON_WORD} />)
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })

  it("still renders a single-mora word's accent line normally (regression: the fallback only engages on real mismatches)", () => {
    // あい (a-ai) is a real 2-glyph, 2-mora hiragana word with a known
    // ACCENT_PATTERNS entry — confirms this test file would actually catch
    // a broken AccentedKana, not just always see the fallback path.
    const { container } = render(<WordCard word={WORDS_BY_ID['a-ai']} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
