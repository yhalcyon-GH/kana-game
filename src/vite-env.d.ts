/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Injected by .github/workflows/deploy.yml from the CI commit SHA — see
  // src/lib/buildInfo.ts. Never hardcoded, and empty/undefined in local dev.
  readonly VITE_BUILD_SHA?: string
  // When set, enables the Send Feedback UI and is the destination it posts
  // to — see src/lib/feedback/. Unset until a real Tally (or equivalent)
  // form URL is configured — see docs/feedback-setup.md.
  readonly VITE_FEEDBACK_URL?: string
  // Selects the analytics provider — only 'umami' is currently implemented
  // (src/lib/analytics/umamiProvider.ts). Any other value, or leaving this
  // unset, keeps the safe no-op/dev-console provider. See
  // docs/feedback-analytics-provider-decision.md.
  readonly VITE_ANALYTICS_PROVIDER?: string
  // Umami Cloud website id — a public client-side identifier by design
  // (like a Plausible/GA site id), not a secret; still never guess or
  // hardcode a real one. See docs/feedback-analytics-provider-decision.md.
  readonly VITE_UMAMI_WEBSITE_ID?: string
  // Optional: overrides the default Umami Cloud script host
  // (https://cloud.umami.is) — only needed for a self-hosted Umami
  // instance or a non-default Cloud region.
  readonly VITE_UMAMI_HOST_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
