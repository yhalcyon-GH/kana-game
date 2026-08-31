import type { ReactNode } from 'react'
import { useId, useLayoutEffect, useRef } from 'react'
import { STROKE_GLYPHS } from '../data/strokeGlyphs'
import { STROKE_PATHS } from '../data/strokes'
import { buildTracingUnit } from '../lib/tracingUnits'

type Props = {
  characterId: string
  playToken: number
  size?: number
  // Which STROKE_PATHS entry to animate. Defaults to `characterId` — only
  // yōon's small ゃ/ゅ/ょ glyph passes a different id here (see
  // TracingUnitAnimation), reusing や/ゆ/よ's full stroke data rather than
  // any hand-authored/newly-fetched small-glyph path (see strokes.ts's
  // generated-file header).
  strokeSourceId?: string
  // Delay (ms) before this glyph's first stroke starts, on top of each
  // stroke's own per-index delay below — used by TracingUnitAnimation to
  // sequence a yōon unit's small glyph after its base glyph finishes,
  // rather than animating both simultaneously (Step 18).
  startDelayMs?: number
}

const VIEWBOX_SIZE = 109 // KanjiVG's standard canvas size for every stroke path
export const STROKE_MS = 500
export const GAP_MS = 200

// Animates a character being drawn stroke-by-stroke over a faint full-glyph
// guide — "here's how you write this" before the learner attempts it
// themselves in TracingPage. Autoplays on mount and whenever characterId
// changes; `playToken` is owned by the caller so a "Watch again" control
// elsewhere on the page can also retrigger it (see TracingPage).
//
// Uses the Web Animations API directly (element.animate()) rather than a
// CSS transition, since a transition needs the browser to actually paint
// the "fully hidden" starting state before the change to the end state can
// be detected as a change to transition — easy to lose to frame-batching
// (state settles to its end value before the hidden state ever paints, so
// nothing visibly animates). animate() always plays a real animation
// regardless of paint timing.
export function StrokeOrderAnimation({ characterId, playToken, size = 160, strokeSourceId, startDelayMs = 0 }: Props) {
  const sourceId = strokeSourceId ?? characterId
  const glyph = STROKE_GLYPHS[sourceId]
  if (glyph) {
    return <StrokeGlyphAnimation glyph={glyph} playToken={playToken} size={size} startDelayMs={startDelayMs} sourceId={sourceId} />
  }
  return <KanjivgStrokeAnimation sourceId={sourceId} playToken={playToken} size={size} startDelayMs={startDelayMs} />
}

// Existing KanjiVG-derived renderer (STROKE_PATHS), unchanged in behavior —
// every non-prototype glyph still uses this path (Issue #122: prototype
// glyphs only switch to StrokeGlyphAnimation; everything else keeps this
// fallback).
function KanjivgStrokeAnimation({
  sourceId,
  playToken,
  size,
  startDelayMs,
}: {
  sourceId: string
  playToken: number
  size: number
  startDelayMs: number
}) {
  const strokes = STROKE_PATHS[sourceId] ?? []
  const pathRefs = useRef<(SVGPathElement | null)[]>([])

  useLayoutEffect(() => {
    const animations = strokes.map((_, i) => {
      const el = pathRefs.current[i]
      if (!el) return null
      const length = el.getTotalLength() || 1
      el.style.strokeDasharray = String(length)
      if (typeof el.animate !== 'function') {
        el.style.strokeDashoffset = '0'
        return null
      }
      el.style.strokeDashoffset = String(length)
      return el.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
        duration: STROKE_MS,
        delay: startDelayMs + i * (STROKE_MS + GAP_MS),
        easing: 'ease-in-out',
        fill: 'forwards',
      })
    })
    return () => animations.forEach((a) => a?.cancel())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, playToken, startDelayMs])

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      width={size}
      height={size}
      className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-neutral-300 dark:text-neutral-600"
      >
        {strokes.map((d, i) => (
          <path key={`guide-${i}`} d={d} />
        ))}
      </g>
      <g fill="none" stroke="#2563eb" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
        {strokes.map((d, i) => (
          <path
            key={`stroke-${i}`}
            ref={(el) => {
              pathRefs.current[i] = el
            }}
            d={d}
          />
        ))}
      </g>
    </svg>
  )
}

// strokesvg-derived renderer (STROKE_GLYPHS) — Phase 1A prototype (Issue
// #122). Uses the glyph's own viewBox (1024 corpus) rather than the fixed
// KanjiVG 109 canvas, clips each animated centerline to its own shadow
// shape via a runtime-generated clip path (unique per component instance —
// see useId() — so multiple simultaneous instances on the same page never
// collide on clip ids), and animates in logical-stroke order: a multi-part
// logical stroke's parts all share the same start delay/dash-offset
// timing and count as exactly one step, per strokesvg's own upstream
// semantics for grouped stroke children.
function StrokeGlyphAnimation({
  glyph,
  playToken,
  size,
  startDelayMs,
  sourceId,
}: {
  glyph: (typeof STROKE_GLYPHS)[string]
  playToken: number
  size: number
  startDelayMs: number
  sourceId: string
}) {
  const instanceId = useId()
  // parts, flattened with their owning logical-stroke index, so every part
  // of a multi-part logical stroke resolves to the same animation delay.
  const flatParts = glyph.logicalStrokes.flatMap((stroke, strokeIndex) =>
    stroke.parts.map((part) => ({ ...part, strokeIndex })),
  )
  const pathRefs = useRef<(SVGPathElement | null)[]>([])

  useLayoutEffect(() => {
    const animations = flatParts.map((part, i) => {
      const el = pathRefs.current[i]
      if (!el) return null
      const length = el.getTotalLength() || 1
      el.style.strokeDasharray = String(length)
      if (typeof el.animate !== 'function') {
        el.style.strokeDashoffset = '0'
        return null
      }
      el.style.strokeDashoffset = String(length)
      return el.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
        duration: STROKE_MS,
        delay: startDelayMs + part.strokeIndex * (STROKE_MS + GAP_MS),
        easing: 'ease-in-out',
        fill: 'forwards',
      })
    })
    return () => animations.forEach((a) => a?.cancel())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, playToken, startDelayMs])

  return (
    <svg
      viewBox={glyph.viewBox}
      width={size}
      height={size}
      className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
    >
      <defs>
        {flatParts.map((part, i) => (
          <clipPath key={`clip-${instanceId}-${i}`} id={`stroke-glyph-clip-${instanceId}-${i}`}>
            <path d={part.shadowD} />
          </clipPath>
        ))}
      </defs>
      <g fill="currentColor" className="text-neutral-300 dark:text-neutral-600">
        {flatParts.map((part, i) => (
          <path key={`guide-${i}`} d={part.shadowD} transform={part.transform} />
        ))}
      </g>
      <g fill="none" stroke="#2563eb" strokeWidth={glyph.strokeWidth} strokeLinecap={glyph.strokeLinecap as 'round' | 'butt' | 'square'}>
        {flatParts.map((part, i) => (
          <path
            key={`stroke-${i}`}
            ref={(el) => {
              pathRefs.current[i] = el
            }}
            d={part.strokeD}
            transform={part.transform}
            clipPath={`url(#stroke-glyph-clip-${instanceId}-${i})`}
          />
        ))}
      </g>
    </svg>
  )
}

// Yōon-aware wrapper around StrokeOrderAnimation, sharing the same
// TracingUnit expansion TracingPage's writing canvas uses (see
// lib/tracingUnits.ts) so the animation's visual arrangement never drifts
// from the writing area's — a single-glyph characterId renders exactly as
// StrokeOrderAnimation always has, and a yōon characterId renders its base
// glyph followed by its small ゃ/ゅ/ょ glyph (borrowed や/ゆ/よ stroke data,
// rendered at a reduced size — never a deformed/skewed one, since the SVG
// viewBox is unchanged and only the rendered width/height shrinks) animated
// in writing order: base glyph's strokes complete, THEN the small glyph's
// strokes play — never simultaneously (Step 18).
const SMALL_GLYPH_SCALE = 0.65

// Fixed-size "writing cell" wrapper — the animation's per-glyph footprint
// must exactly equal `size` (one writing cell, matching the writing
// canvas's packTracingRows model in TracingPage), regardless of whether the
// glyph rendered inside is a full-size normal/base glyph or a small
// ゃ/ゅ/ょ scaled down via SMALL_GLYPH_SCALE — the scaling only shrinks the
// SVG content INSIDE the cell, never the cell slot itself, so a unit's
// total rendered width is always exactly `glyphs.length * size` (Step 24
// bugfix: previously a small glyph's own narrower SVG shrank the flex
// item's width too, so total unit width was less than what
// packTracingRows/unitCellWidth already reserves for it in the canvas,
// misaligning the animation against the canvas grid).
// `align: 'start'` (used for the small glyph's cell only) pulls its content
// to the cell's leading edge instead of centering it, so the small glyph
// sits visually adjacent to the base glyph's cell rather than floating in
// the middle of its own full-width cell with a large empty gap on the
// base-glyph side. The base glyph's own card already fills its entire
// `size`×`size` cell (its <svg width/height is exactly `size`, see
// StrokeOrderAnimation), so there's no analogous slack to justify away on
// that side — the two bordered cards already sit flush together (gap-0)
// (Step 25 — see the matching nudge in TracingPage's canvas drawGlyph,
// which must stay visually consistent with this for the small glyph).
function TracingCell({ size, children, align = 'center' }: { size: number; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-end ${align === 'start' ? 'justify-start' : 'justify-center'}`}
    >
      {children}
    </div>
  )
}

export function TracingUnitAnimation({
  characterId,
  playToken,
  size = 160,
}: {
  characterId: string
  playToken: number
  size?: number
}) {
  const unit = buildTracingUnit(characterId)
  if (unit.glyphs.length <= 1) {
    return (
      <TracingCell size={size}>
        <StrokeOrderAnimation characterId={characterId} playToken={playToken} size={size} />
      </TracingCell>
    )
  }
  const [base, small] = unit.glyphs
  const baseStrokeCount = STROKE_GLYPHS[base.strokeSourceId]?.logicalStrokes.length ?? STROKE_PATHS[base.strokeSourceId]?.length ?? 0
  const smallStartDelayMs = baseStrokeCount * (STROKE_MS + GAP_MS)
  return (
    <div className="flex gap-0">
      <TracingCell size={size}>
        <StrokeOrderAnimation characterId={characterId} strokeSourceId={base.strokeSourceId} playToken={playToken} size={size} />
      </TracingCell>
      <TracingCell size={size} align="start">
        <StrokeOrderAnimation
          characterId={`${characterId}-small`}
          strokeSourceId={small.strokeSourceId}
          playToken={playToken}
          size={Math.round(size * SMALL_GLYPH_SCALE)}
          startDelayMs={smallStartDelayMs}
        />
      </TracingCell>
    </div>
  )
}
