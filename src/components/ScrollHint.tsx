import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

// How close to the bottom (px) counts as "already scrolled to the end" —
// hides the hint slightly before the exact bottom so it doesn't flicker at
// the very last pixel of a bouncy/overscroll mobile scroll.
const BOTTOM_THRESHOLD_PX = 24

// A small, semi-transparent, pointer-events-none downward chevron pinned to
// the bottom of the viewport, shown only when the page is scrollable AND
// not yet scrolled near the bottom — a passive "there's more below" cue for
// screens where the primary action (e.g. Practice's Next button after
// incorrect feedback) can land below the fold on a short viewport. Mounted
// ONCE at the app layout level (see App.tsx), not per-page, so it reacts to
// every route's content automatically instead of being wired into each
// screen individually.
export function ScrollHint() {
  const [visible, setVisible] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const doc = document.documentElement

    const recompute = () => {
      const scrollable = doc.scrollHeight - doc.clientHeight > BOTTOM_THRESHOLD_PX
      const nearBottom = doc.scrollHeight - doc.clientHeight - window.scrollY <= BOTTOM_THRESHOLD_PX
      setVisible(scrollable && !nearBottom)
    }

    recompute()

    window.addEventListener('scroll', recompute, { passive: true })
    window.addEventListener('resize', recompute)

    // Recompute when content height changes (route change already covered
    // by the `pathname` dependency below, but this also catches in-page
    // content changes — e.g. answer feedback appearing — without a poll).
    const resizeObserver = new ResizeObserver(recompute)
    resizeObserver.observe(document.body)

    return () => {
      window.removeEventListener('scroll', recompute)
      window.removeEventListener('resize', recompute)
      resizeObserver.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 bottom-2 z-40 flex justify-center transition-opacity duration-300 motion-reduce:transition-none ${
        visible ? 'opacity-60' : 'opacity-0'
      }`}
    >
      <div className="rounded-full bg-neutral-900/70 p-1.5 text-white shadow-sm dark:bg-neutral-100/70 dark:text-neutral-900">
        <svg
          className="h-4 w-4 animate-bounce motion-reduce:animate-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  )
}
