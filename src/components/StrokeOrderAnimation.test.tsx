import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { STROKE_PATHS } from '../data/strokes'
import { StrokeOrderAnimation } from './StrokeOrderAnimation'

// きゃ (kya) — a real yōon character. KanjiVG (the stroke-data source; see
// scripts/fetchStrokeData.ts) has no combined-glyph entry for a 2-character
// digraph like this, and this project deliberately did NOT run that script
// for yōon characters — re-running it naively would key kya's entry off
// kana.codePointAt(0) (き's codepoint alone), silently writing き's stroke
// data mislabeled as きゃ's, which is worse than having none. So STROKE_PATHS
// has no entry for 'kya' at all, and this test proves the `?? []` fallback
// in StrokeOrderAnimation actually renders safely (empty guide, no crash)
// rather than just assuming it does.
describe('StrokeOrderAnimation with a yōon character (no KanjiVG data)', () => {
  it('STROKE_PATHS genuinely has no entry for it (not just theoretically missing)', () => {
    expect(STROKE_PATHS['kya']).toBeUndefined()
  })

  it('renders without crashing, as an empty guide (zero stroke paths)', () => {
    const { container } = render(<StrokeOrderAnimation characterId="kya" playToken={0} />)
    // Two <g> groups (guide + drawable strokes), each with zero <path>
    // children — an empty canvas, not a broken one.
    expect(container.querySelectorAll('path')).toHaveLength(0)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders real stroke paths for an ordinary single-glyph character (regression: the empty case above is real, not a universal no-op)', () => {
    const { container } = render(<StrokeOrderAnimation characterId="a" playToken={0} />)
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })
})

// ファ (katakana-fa) — a real 特殊音 character, same "no KanjiVG data, never
// run fetchStrokeData.ts for it" situation as yōon above, just via a
// different 2-glyph construction (base katakana + small vowel instead of
// base + small ゃゅょ). Re-running fetchStrokeData.ts naively would key
// ファ's entry off kana.codePointAt(0) (フ's codepoint alone), silently
// writing フ's real stroke data mislabeled as ファ's — see characters.ts's
// ===== 特殊音 ===== block and docs/curriculum-extensibility.md.
describe('StrokeOrderAnimation with a 特殊音 character (no KanjiVG data)', () => {
  it('STROKE_PATHS genuinely has no entry for it (not just theoretically missing)', () => {
    expect(STROKE_PATHS['katakana-fa']).toBeUndefined()
  })

  it('renders without crashing, as an empty guide (zero stroke paths)', () => {
    const { container } = render(<StrokeOrderAnimation characterId="katakana-fa" playToken={0} />)
    expect(container.querySelectorAll('path')).toHaveLength(0)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
