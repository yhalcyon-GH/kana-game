import type { ScreenSizeCategory } from './analytics/types'

// Bucketed rather than exact pixel dimensions — used by both analytics
// properties and the feedback context, neither of which should carry a
// precise viewport size (a fingerprinting signal) — see
// analytics/types.ts's AnalyticsProperties doc comment.
const SMALL_MAX = 640
const MEDIUM_MAX = 1024

export function getScreenSizeCategory(width: number): ScreenSizeCategory {
  if (width <= SMALL_MAX) return 'small'
  if (width <= MEDIUM_MAX) return 'medium'
  return 'large'
}

export function currentScreenSizeCategory(): ScreenSizeCategory {
  if (typeof window === 'undefined') return 'medium'
  return getScreenSizeCategory(window.innerWidth)
}
