/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Injected by .github/workflows/deploy.yml from the CI commit SHA — see
  // src/lib/buildInfo.ts. Never hardcoded, and empty/undefined in local dev.
  readonly VITE_BUILD_SHA?: string
  // When set, enables the Send Feedback UI and is the destination it posts
  // to — see src/lib/feedback/. Unset in this release: no feedback
  // provider is connected yet.
  readonly VITE_FEEDBACK_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
