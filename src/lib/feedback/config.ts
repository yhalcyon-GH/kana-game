// Whether the Send Feedback UI should render at all. Gated purely on
// whether a destination is configured at build time — never guessed, never
// a hardcoded fallback URL. See docs/analytics-foundation.md.
export function isFeedbackEnabled(): boolean {
  return Boolean(import.meta.env.VITE_FEEDBACK_URL)
}

export function getFeedbackUrl(): string | undefined {
  return import.meta.env.VITE_FEEDBACK_URL
}
