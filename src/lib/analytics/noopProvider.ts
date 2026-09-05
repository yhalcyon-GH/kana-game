import type { AnalyticsProvider } from './types'

// Default production provider: sends nothing anywhere. This foundation
// intentionally does not connect any third-party analytics service — see
// docs/analytics-foundation.md for what a future provider swap would need
// (including a Privacy Policy update first).
export const noopProvider: AnalyticsProvider = {
  track: () => {},
}
