import { consoleProvider } from './consoleProvider'
import { noopProvider } from './noopProvider'
import type { AnalyticsEventName, AnalyticsProperties, AnalyticsProvider } from './types'

// Dev builds log to the console for local visibility; production ships
// with the no-op provider — no third-party analytics service is connected
// by this foundation (see docs/analytics-foundation.md). Swapping in a real
// provider later means changing only this one assignment.
export const activeProvider: AnalyticsProvider = import.meta.env.DEV ? consoleProvider : noopProvider

// Exported only so track.test.ts can prove the try/catch below actually
// swallows a throwing provider — not meant for use outside this module.
export function trackWith(provider: AnalyticsProvider, event: AnalyticsEventName, properties?: AnalyticsProperties): void {
  try {
    provider.track(event, properties)
  } catch {
    // Swallowed deliberately: a provider bug or a future real provider's
    // network failure must never interrupt the learning flow that called
    // track().
  }
}

// The only function game code should call. Never throws. See types.ts for
// the fixed, low-cardinality event/property vocabulary this accepts.
export function track(event: AnalyticsEventName, properties?: AnalyticsProperties): void {
  trackWith(activeProvider, event, properties)
}
