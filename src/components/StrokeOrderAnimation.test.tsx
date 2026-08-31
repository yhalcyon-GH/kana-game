import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { STROKE_GLYPHS } from '../data/strokeGlyphs'
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

// StrokeGlyphAnimation (Phase 1A prototype — Issue #122): the six
// representative glyphs (あ/き/ず/ア/シ/ツ) render from the new
// strokesvg-derived STROKE_GLYPHS data path instead of KanjiVG's
// STROKE_PATHS. Every other character keeps using StrokeOrderAnimation's
// existing KanjiVG fallback unchanged (verified above).
describe('StrokeOrderAnimation with prototype strokesvg glyphs', () => {
  it('all six prototype glyphs actually have STROKE_GLYPHS entries (precondition for the tests below)', () => {
    for (const id of ['a', 'ki', 'zu', 'katakana-a', 'katakana-shi', 'katakana-tsu']) {
      expect(STROKE_GLYPHS[id]).toBeDefined()
    }
  })

  it('renders each prototype glyph with one guide <path> and one animated <path> per part, using the glyph viewBox', () => {
    for (const id of ['a', 'ki', 'zu', 'katakana-a', 'katakana-shi', 'katakana-tsu']) {
      const { container } = render(<StrokeOrderAnimation characterId={id} playToken={0} />)
      const svg = container.querySelector('svg')
      const glyph = STROKE_GLYPHS[id]
      const partCount = glyph.logicalStrokes.reduce((n, s) => n + s.parts.length, 0)
      expect(svg?.getAttribute('viewBox')).toBe(glyph.viewBox)
      // Two <g> groups (guide + drawable strokes), each with one <path> per
      // part — never one <path> per logical stroke, since a multi-part
      // logical stroke's parts render (and clip) individually while
      // animating together.
      expect(container.querySelectorAll('g > path')).toHaveLength(partCount * 2)
    }
  })

  it('あ still counts as 3 logical strokes, not 4 paths — the third stroke\'s 2 parts render as extra <path>s but share one stroke-index-driven start delay', () => {
    const glyph = STROKE_GLYPHS['a']
    expect(glyph.logicalStrokes).toHaveLength(3)
    const { container } = render(<StrokeOrderAnimation characterId="a" playToken={0} />)
    // 3 logical strokes, but stroke 3 has 2 parts -> 4 total animated paths
    // in the drawable group; the logical-stroke count must stay 3.
    const drawableGroup = container.querySelectorAll('g')[1]
    expect(drawableGroup.querySelectorAll('path')).toHaveLength(4)
  })

  it('ず: the transform on both parts of its multi-part logical stroke reaches the rendered guide and stroke paths', () => {
    const { container } = render(<StrokeOrderAnimation characterId="zu" playToken={0} />)
    const transformedPaths = [...container.querySelectorAll('path')].filter((p) => p.getAttribute('transform') === 'translate(0 .01)')
    // 2 parts x 2 groups (guide + drawable) = 4 paths carrying the transform.
    expect(transformedPaths).toHaveLength(4)
  })

  it('two simultaneous instances of the same prototype glyph do not collide on clip-path ids', () => {
    const { container } = render(
      <>
        <StrokeOrderAnimation characterId="a" playToken={0} />
        <StrokeOrderAnimation characterId="a" playToken={0} />
      </>,
    )
    const clipIds = [...container.querySelectorAll('clipPath')].map((el) => el.id)
    expect(clipIds.length).toBeGreaterThan(0)
    expect(new Set(clipIds).size).toBe(clipIds.length)
    // Every clip-path reference used by a <path> must resolve to a clipPath
    // id that actually exists in this render — no dangling/collided refs.
    const clipRefs = [...container.querySelectorAll('path[clip-path]')].map((p) =>
      p.getAttribute('clip-path')!.replace(/^url\(#(.+)\)$/, '$1'),
    )
    for (const ref of clipRefs) {
      expect(clipIds).toContain(ref)
    }
  })

  it('replay: bumping playToken keeps rendering the prototype glyph\'s paths', () => {
    const { container, rerender } = render(<StrokeOrderAnimation characterId="katakana-shi" playToken={0} />)
    const before = container.querySelectorAll('path').length
    expect(before).toBeGreaterThan(0)
    rerender(<StrokeOrderAnimation characterId="katakana-shi" playToken={1} />)
    expect(container.querySelectorAll('path')).toHaveLength(before)
  })

  it('a non-prototype glyph still uses the existing KanjiVG fallback safely (no STROKE_GLYPHS entry, no crash)', () => {
    expect(STROKE_GLYPHS['ka']).toBeUndefined()
    const { container } = render(<StrokeOrderAnimation characterId="ka" playToken={0} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 109 109')
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('clipPath')).toHaveLength(0)
  })
})
