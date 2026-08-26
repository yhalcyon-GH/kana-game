import { CharacterCard } from './CharacterCard'
import { SIMILAR_LETTER_ANNOTATIONS } from '../data/similarLetterAnnotations'
import type { KanaChar } from '../data/types'

type Props = {
  char: KanaChar
}

// Thin wrapper around the EXISTING CharacterCard (never a re-fonted/
// re-styled copy — see the Issue's "must match the real Learn font" rule):
// draws a decorative red-pen SVG overlay on top of it in a normalized 0-100
// viewBox, so arrows/circles/lines scale with the card at any screen size
// instead of drifting at fixed pixel coordinates. The overlay never
// intercepts clicks/taps (`pointer-events-none`), so the card underneath
// stays fully tappable for its pronunciation audio exactly as it already
// is everywhere else in the app.
export function AnnotatedKanaCard({ char }: Props) {
  const annotation = SIMILAR_LETTER_ANNOTATIONS[char.id]

  return (
    <div className="relative inline-flex flex-col items-center gap-1">
      <div className="relative">
        <CharacterCard char={char} />
        {annotation && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {annotation.marks.map((mark, i) => {
              if (mark.type === 'circle') {
                return (
                  <circle
                    key={i}
                    cx={mark.cx}
                    cy={mark.cy}
                    r={mark.r}
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              }
              if (mark.type === 'line') {
                return (
                  <line
                    key={i}
                    x1={mark.x1}
                    y1={mark.y1}
                    x2={mark.x2}
                    y2={mark.y2}
                    stroke="#dc2626"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )
              }
              return (
                <line
                  key={i}
                  x1={mark.x1}
                  y1={mark.y1}
                  x2={mark.x2}
                  y2={mark.y2}
                  stroke="#dc2626"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  markerEnd={`url(#similar-letter-arrowhead)`}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            <defs>
              <marker
                id="similar-letter-arrowhead"
                markerWidth="6"
                markerHeight="6"
                refX="4"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#dc2626" />
              </marker>
            </defs>
          </svg>
        )}
      </div>
      {/* The accessible equivalent of the red marks above — screen readers
          don't perceive color, so this short caption is what actually
          carries "what's different here," not just decoration duplicated in
          text. Visually small/muted since the marks themselves are the
          primary presentation. */}
      {annotation && (
        <p className="max-w-[9rem] text-center text-[11px] text-neutral-500 dark:text-neutral-400">{annotation.caption}</p>
      )}
    </div>
  )
}
