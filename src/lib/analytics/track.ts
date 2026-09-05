import { consoleProvider } from './consoleProvider'
import { noopProvider } from './noopProvider'
import type { AnalyticsEventName, AnalyticsProperties, AnalyticsProvider } from './types'
import { isUmamiConfigured } from './umamiConfig'
import { createUmamiProvider } from './umamiProvider'

// Provider selection: Umami is used only when BOTH VITE_ANALYTICS_PROVIDER
// is set to 'umami' AND a website id is configured (isUmamiConfigured
// checks both) — a half-configured environment (e.g. the provider flag set
// with no website id yet, such as before the id is obtained — see
// docs/feedback-analytics-provider-decision.md's USER ACTION REQUIRED
// section) falls back to the safe no-op/dev-console providers below rather
// than loading a script that can't work. Dev builds without Umami
// configured log to the console for local visibility; production without
// Umami configured ships the no-op provider — no third-party analytics
// service is connected unless explicitly configured. Swapping in a
// different provider later means changing only this one assignment.
export const activeProvider: AnalyticsProvider = isUmamiConfigured()
  ? createUmamiProvider()
  : import.meta.env.DEV
    ? consoleProvider
    : noopProvider

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
