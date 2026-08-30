import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { STROKE_PATHS } from '../data/strokes'
import { StrokeOrderAnimation, TracingUnitAnimation } from './StrokeOrderAnimation'

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

// TracingUnitAnimation (see lib/tracingUnits.ts) is the yōon-aware wrapper
// TracingPage actually renders — the fix for the gap the tests above
// document: viewing きゃ's animation must show BOTH き's and ゃ's strokes,
// never just き's (or, before this fix, neither at all).
describe('TracingUnitAnimation', () => {
  it('normal single-glyph character: renders exactly one animation (unchanged from StrokeOrderAnimation)', () => {
    const { container } = render(<TracingUnitAnimation characterId="a" playToken={0} />)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('sokuon (っ): still renders as a single normal unit', () => {
    const { container } = render(<TracingUnitAnimation characterId="sokuon" playToken={0} />)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })

  it('yōon きゃ: renders TWO svgs (base き + small ゃ), each with real stroke paths — never just き', () => {
    const { container } = render(<TracingUnitAnimation characterId="kya" playToken={0} />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs).toHaveLength(2)
    // Each svg has a guide <g> and a drawable <g>, each holding the same
    // stroke count — so nonzero <path> counts in both proves both き's (id
    // 'ki') AND ゃ's (borrowed 'ya') real stroke data rendered, not one
    // glyph left empty.
    svgs.forEach((svg) => {
      expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
    })
  })

  it('yōon small glyph renders visibly smaller than the base glyph', () => {
    const { container } = render(<TracingUnitAnimation characterId="kya" playToken={0} size={160} />)
    const svgs = Array.from(container.querySelectorAll('svg'))
    const widths = svgs.map((svg) => Number(svg.getAttribute('width')))
    expect(widths[0]).toBe(160)
    expect(widths[1]).toBeLessThan(widths[0])
    expect(widths[1]).toBeGreaterThan(widths[0] * 0.5) // stays in the 60-70% ballpark, not illegibly tiny
  })

  it('katakana yōon キャ: also renders two svgs with real stroke paths', () => {
    const { container } = render(<TracingUnitAnimation characterId="katakana-kya" playToken={0} />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs).toHaveLength(2)
    svgs.forEach((svg) => expect(svg.querySelectorAll('path').length).toBeGreaterThan(0))
  })

  it('replay: bumping playToken re-renders both glyphs together without dropping either', () => {
    const { container, rerender } = render(<TracingUnitAnimation characterId="kya" playToken={0} />)
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    rerender(<TracingUnitAnimation characterId="kya" playToken={1} />)
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    container.querySelectorAll('svg').forEach((svg) => expect(svg.querySelectorAll('path').length).toBeGreaterThan(0))
  })
})
