import { useLayoutEffect, useRef } from 'react'
import { STROKE_PATHS } from '../data/strokes'

type Props = {
  characterId: string
  playToken: number
  size?: number
}

const VIEWBOX_SIZE = 109 // KanjiVG's standard canvas size for every stroke path
const STROKE_MS = 500
const GAP_MS = 200

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
export function StrokeOrderAnimation({ characterId, playToken, size = 160 }: Props) {
  const strokes = STROKE_PATHS[characterId] ?? []
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
        delay: i * (STROKE_MS + GAP_MS),
        easing: 'ease-in-out',
        fill: 'forwards',
      })
    })
    return () => animations.forEach((a) => a?.cancel())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, playToken])

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
