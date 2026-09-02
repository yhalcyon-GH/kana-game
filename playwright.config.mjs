import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './browser-smoke',
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/kana-game/',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/kana-game/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
