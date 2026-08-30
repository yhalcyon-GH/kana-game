import type { ReactNode } from 'react'

// Shared "this is the recommended thing to do/try next" decoration — used
// by HomePage, CategoryRowsPage/RowMap, and PracticeHubPage, all reading
// the SAME app-wide value (useCurriculum's globalRecommendedTarget — see
// lib/recommendedPath's getGlobalRecommendedTarget). Purely presentational:
// callers decide WHAT is recommended; this only makes it easier to notice.

// "⭐ Recommended" in red/bold/slightly larger than a plain section label —
// callers pass their own label text/heading element around it as needed.
export function RecommendedLabel() {
  return <span className="font-bold text-red-600 dark:text-red-400">⭐ Recommended</span>
}

// Wraps a card (or single-card section) with small static sparkles at the
// top-left and bottom-right corners. Inset (not negative-offset) so they
// stay inside the card's own bounds rather than overflowing past its edges
// — matters for cards that sit close together in a grid. No animation, no
// new illustration style — reuses the app's existing emoji-driven visual
// language.
export function RecommendedFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute top-1 left-1 text-sm select-none">
        ✨
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute right-1 bottom-1 text-sm select-none">
        ✨
      </span>
      {children}
    </div>
  )
}
