// Build metadata for bug reports — see the About page and the Send
// Feedback foundation (src/lib/feedback/). VITE_BUILD_SHA is injected at
// build time by vite.config.ts from the CI environment's commit SHA (see
// .github/workflows/deploy.yml); it is never hardcoded here. Local dev
// builds have no CI-provided SHA, so they fall back to a safe, obviously-
// not-a-real-commit placeholder instead of an empty string.
export const BUILD_SHA: string = import.meta.env.VITE_BUILD_SHA || (import.meta.env.DEV ? 'dev' : 'unknown')

// Short form for compact display (About page, feedback context) — full SHA
// stays available via BUILD_SHA for anyone who needs to paste it exactly.
export const SHORT_BUILD_SHA: string = BUILD_SHA === 'dev' || BUILD_SHA === 'unknown' ? BUILD_SHA : BUILD_SHA.slice(0, 7)
