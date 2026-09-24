// Config for the optional, same-origin-only Umami analytics provider — see
// docs/analytics-foundation.md and docs/feedback-analytics-provider-decision.md.
// Both values are build-time VITE_* env vars, so they end up in the public
// client bundle; a Umami website ID is a public client-side identifier by
// design (the same way a Plausible/GA "site ID" is), not a secret — see the
// provider decision doc for why this is safe to ship in a public
// repo/bundle. Never a private/admin API key.
//
// Security posture (2026-09 hardening, audit #391): this app must never
// execute third-party JavaScript served from a different origin than the
// Tamamizu page itself, including on auth/account surfaces — loading
// https://cloud.umami.is/script.js in Production was exactly that, and is
// no longer allowed. See isUmamiHostAllowed below and umamiProvider.ts's
// injectUmamiScript, which enforces this at the point the script tag would
// be created. A cross-origin VITE_UMAMI_HOST_URL (including the unset/
// default Umami Cloud case) now fails closed to no script injection, not a
// fallback to Umami Cloud.
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
// This does NOT check the host's origin — that's enforced separately (see
// isUmamiHostAllowed) at the point the script tag is actually created, so
// track() calls can still safely no-op via a missing window.umami even
// when the configured host is cross-origin and gets rejected.
export function isUmamiConfigured(): boolean {
  return getAnalyticsProvider() === 'umami' && Boolean(getUmamiWebsiteId())
}

// Same-origin enforcement: an Umami host is only ever allowed to have its
// script tag injected when its resolved origin EXACTLY matches the page's
// own origin. `currentOrigin` is an explicit parameter (rather than reading
// `window.location.origin` internally) so this stays a pure, easily
// testable function for both the same-origin-allowed and cross-origin-
// rejected cases — see umamiConfig.test.ts. There is deliberately no
// default/fallback host anymore: an unset host is never "allowed" by this
// function, it's simply not something the caller should invoke this with
// (see injectUmamiScript's own unset-host check).
export function isUmamiHostAllowed(hostUrl: string, currentOrigin: string): boolean {
  try {
    return new URL(hostUrl).origin === currentOrigin
  } catch {
    return false
  }
}
