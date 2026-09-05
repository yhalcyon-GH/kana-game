import type { FeedbackContext } from './types'

// Whether the Send Feedback UI should render at all. Gated purely on
// whether a destination is configured at build time — never guessed, never
// a hardcoded fallback URL. See docs/analytics-foundation.md.
export function isFeedbackEnabled(): boolean {
  return Boolean(import.meta.env.VITE_FEEDBACK_URL)
}

export function getFeedbackUrl(): string | undefined {
  return import.meta.env.VITE_FEEDBACK_URL
}

// Builds the actual destination URL the Send Feedback button opens,
// carrying context as generic query parameters — provider-neutral because
// it doesn't assume any specific destination's field names (a Google Form,
// a GitHub issue template, a Typeform, or anything else configured via
// VITE_FEEDBACK_URL can choose to read these standard param names or
// ignore them entirely). Returns undefined when no destination is
// configured, matching isFeedbackEnabled().
//
// Never includes free-text feedback content itself — this only carries
// reproduction context (route/build/screen size), never anything the
// learner typed (see docs/analytics-foundation.md's "absolutely never
// sends" list).
export function buildFeedbackDestinationUrl(context: FeedbackContext): string | undefined {
  const base = getFeedbackUrl()
  if (!base) return undefined
  const url = new URL(base)
  url.searchParams.set('route', context.route)
  url.searchParams.set('build', context.buildSha)
  url.searchParams.set('screen', context.screenSize)
  if (context.appVersion) url.searchParams.set('version', context.appVersion)
  return url.toString()
}
