import { defineConfig, devices } from '@playwright/test'

// Bounded browser smoke suite (Issue #177) — Chromium only, seven scoped
// browser-boundary flows Vitest/jsdom cannot prove (real layout/overflow at
// a narrow viewport, real <canvas> pointer events, real hash-based routing,
// a real <audio> element). Deliberately separate from `npm test`/`npm run
// verify` (see package.json's "e2e" script and vite.config.ts's vitest
// `exclude`) — this is not a general E2E or visual-regression project; see
// e2e/README.md and CLAUDE.md's Product-behavior guardrails before adding
// more coverage here.
const PORT = 4173
const BASE_URL = `http://127.0.0.1:${PORT}/kana-game/`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // Artifacts retained only on failure (Issue #177's CI guardrail) — keeps
    // a normal green run from accumulating trace/screenshot output.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Deterministic local preview server, not the Vite dev server — this
  // exercises the same static build GitHub Pages actually serves (base
  // path included), matching the issue's "builds/serves the app in a
  // deterministic local preview/server" requirement.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
