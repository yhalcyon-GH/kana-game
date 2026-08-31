import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STROKE_GLYPHS } from '../data/strokeGlyphs'
import { STROKE_PATHS } from '../data/strokes'
import { GAP_MS, STROKE_MS, StrokeOrderAnimation, TracingUnitAnimation } from './StrokeOrderAnimation'

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

  // jsdom doesn't implement Element.animate — StrokeGlyphAnimation's
  // useLayoutEffect detects that (`typeof el.animate !== 'function'`) and
  // skips the animate() call entirely, falling back to a static
  // strokeDashoffset. That fallback made the test above unable to prove
  // anything about actual per-part timing — it could only infer delay
  // correctness from path counts and code comments. Stubbing
  // Element.prototype.animate locally (not in setupTests.ts, since no other
  // test needs it) makes the real animate() call path run, so the delay
  // math itself gets asserted directly.
  describe('あ\'s multi-part third logical stroke: actual animate() delay per part', () => {
    let animateSpy: ReturnType<typeof vi.fn>
    let restoreAnimate: (() => void) | undefined

    afterEach(() => {
      restoreAnimate?.()
      restoreAnimate = undefined
    })

    function stubAnimate() {
      const original = Element.prototype.animate
      animateSpy = vi.fn(() => ({ cancel: () => {} }) as unknown as Animation)
      Element.prototype.animate = animateSpy as unknown as typeof Element.prototype.animate
      restoreAnimate = () => {
        Element.prototype.animate = original
      }
    }

    it('both parts of logical stroke 3 receive the identical delay (the same logical-stroke start time), distinct from strokes 1 and 2', () => {
      stubAnimate()
      render(<StrokeOrderAnimation characterId="a" playToken={0} />)
      // 4 animated <path> elements (parts of strokes 1, 2, 3a, 3b) -> 4
      // animate() calls, one per part, in render order.
      expect(animateSpy).toHaveBeenCalledTimes(4)
      const delays = animateSpy.mock.calls.map((call) => (call[1] as KeyframeAnimationOptions).delay)
      const [delay1, delay2, delay3a, delay3b] = delays
      // Both parts of the 2-part third logical stroke share one delay.
      expect(delay3a).toBe(delay3b)
      // That shared delay is stroke-index 2's slot, after strokes 1 and 2.
      expect(delay1).toBe(0)
      expect(delay2).toBe(STROKE_MS + GAP_MS)
      expect(delay3a).toBe(2 * (STROKE_MS + GAP_MS))
    })

    it('startDelayMs offsets every part uniformly, still keeping the two third-stroke parts equal to each other', () => {
      stubAnimate()
      render(<StrokeOrderAnimation characterId="a" playToken={0} startDelayMs={1000} />)
      const delays = animateSpy.mock.calls.map((call) => (call[1] as KeyframeAnimationOptions).delay)
      const [delay1, , delay3a, delay3b] = delays
      expect(delay1).toBe(1000)
      expect(delay3a).toBe(delay3b)
      expect(delay3a).toBe(1000 + 2 * (STROKE_MS + GAP_MS))
    })
  })

  it('ず: the transform on both parts of its multi-part logical stroke reaches the rendered animated stroke paths only — never the guide shadow or its clip shape', () => {
    const { container } = render(<StrokeOrderAnimation characterId="zu" playToken={0} />)
    const svg = container.querySelector('svg')!
    const guideGroup = svg.querySelectorAll(':scope > g')[0]
    const drawableGroup = svg.querySelectorAll(':scope > g')[1]

    const transformedDrawablePaths = [...drawableGroup.querySelectorAll('path')].filter(
      (p) => p.getAttribute('transform') === 'translate(0 .01)',
    )
    // 2 parts of the multi-part logical stroke carry the transform on the
    // animated stroke path — matching upstream ず.svg, where transform sits
    // only on the <path> inside the strokes group.
    expect(transformedDrawablePaths).toHaveLength(2)

    // Upstream's shadow paths and clipPath <path> shapes are untransformed
    // (the transform lives only on the stroke path that references them via
    // clip-path) — so no guide <path> and no <clipPath><path> may carry it.
    const transformedGuidePaths = [...guideGroup.querySelectorAll('path')].filter((p) => p.hasAttribute('transform'))
    expect(transformedGuidePaths).toHaveLength(0)
    const transformedClipShapes = [...svg.querySelectorAll('clipPath path')].filter((p) => p.hasAttribute('transform'))
    expect(transformedClipShapes).toHaveLength(0)
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
