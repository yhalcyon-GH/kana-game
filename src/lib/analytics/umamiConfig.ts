// Config for the optional Umami Cloud analytics provider — see
// docs/analytics-foundation.md and docs/feedback-analytics-provider-decision.md.
// Both values are build-time VITE_* env vars, so they end up in the public
// client bundle; a Umami Cloud website ID is a public client-side
// identifier by design (the same way a Plausible/GA "site ID" is), not a
// secret — see the provider decision doc for why this is safe to ship in a
// public repo/bundle. Never a private/admin API key.
export function getAnalyticsProvider(): string | undefined {
  return import.meta.env.VITE_ANALYTICS_PROVIDER
}

export function getUmamiWebsiteId(): string | undefined {
  return import.meta.env.VITE_UMAMI_WEBSITE_ID
}

export function getUmamiHostUrl(): string | undefined {
  return import.meta.env.VITE_UMAMI_HOST_URL
}

// Both the provider selector AND a valid website id must be present to
// actually activate Umami — a half-configured environment (e.g.
// VITE_ANALYTICS_PROVIDER=umami with no website id yet) must fall back to
// the safe no-op provider rather than loading a script that can't work.
export function isUmamiConfigured(): boolean {
  return getAnalyticsProvider() === 'umami' && Boolean(getUmamiWebsiteId())
}
