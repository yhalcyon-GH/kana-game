import type { AnalyticsProvider } from './types'

// Dev-only visibility into what would be tracked, so instrumentation can be
// sanity-checked locally without any real provider connected. Never used in
// production builds — see track.ts's import.meta.env.DEV gate.
export const consoleProvider: AnalyticsProvider = {
  track: (event, properties) => {
    console.debug('[analytics]', event, properties ?? {})
  },
}
