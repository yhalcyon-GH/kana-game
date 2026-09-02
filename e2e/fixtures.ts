import type { Page } from '@playwright/test'

// Mirrors src/store/progressStore.ts's zustand `persist` config — the
// localStorage key it writes to, and the shape zustand's persist middleware
// itself wraps state in (`{ state, version }`, see zustand's
// createJSONStorage/persistImpl). Bump STORE_VERSION if that store's own
// `version` changes; mergePersistedProgress's tolerant field-by-field merge
// means a STORE_VERSION that's merely behind the real one is still safe
// (any newer migration still runs on top of this seed) — only a version
// AHEAD of the real one would incorrectly skip a real migration.
const STORAGE_KEY = 'kana-game-progress'
const STORE_VERSION = 20

// Every one-time "first visit" Guide overlay the app can show, flipped to
// already-completed. IntroGuide (src/components/IntroGuide.tsx) in
// particular renders unconditionally over EVERY route while
// hasCompletedIntroGuide is false (see App.tsx), so any spec that isn't
// itself testing the first-launch Introduction must seed this — otherwise
// every other check would be blocked behind that full-screen dialog.
const GUIDES_COMPLETED = {
  hasCompletedIntroGuide: true,
  hasCompletedLearnTracingGuide: true,
  hasCompletedPracticeGuide: true,
  hasCompletedReviewGuide: true,
  hasCompletedSokuonGuide: true,
  hasCompletedChouonGuide: true,
  hasCompletedYouonGuide: true,
  hasCompletedSpecialKatakanaGuide: true,
  hasCompletedHiraganaSectionGuide: true,
  hasCompletedKatakanaSectionGuide: true,
  hasCompletedParticleGuide: true,
}

export type ProgressSeed = Partial<typeof GUIDES_COMPLETED>

// Seeds localStorage with a known progress state BEFORE the app's own
// scripts run — Playwright's addInitScript runs ahead of every page script
// on every subsequent navigation in this page, which is what lets each spec
// start from deterministic state instead of whatever a previous run left
// behind (this repo's guardrail: "prefer deterministic storage/state setup
// over depending on random order"). Must be called before the first
// page.goto() in a test.
export async function seedProgress(page: Page, overrides: ProgressSeed = {}) {
  const state = { ...GUIDES_COMPLETED, ...overrides }
  await page.addInitScript(
    ({ key, version, state: seededState }) => {
      window.localStorage.setItem(key, JSON.stringify({ state: seededState, version }))
    },
    { key: STORAGE_KEY, version: STORE_VERSION, state },
  )
}
