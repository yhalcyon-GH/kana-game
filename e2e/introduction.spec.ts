import { expect, test } from '@playwright/test'

// Scope 1 (Issue #177): first launch shows the Tamamizu Introduction, and
// Skip reaches Home. Deliberately does NOT seed progress (see
// e2e/fixtures.ts) — fresh, empty localStorage IS the first-launch state
// this proves; every other spec in this suite seeds
// hasCompletedIntroGuide: true precisely to skip this dialog.
test('first launch shows the Introduction and Skip reaches Home', async ({ page }) => {
  await page.goto('')

  const intro = page.getByRole('dialog', { name: 'Tamamizu Guide' })
  await expect(intro).toBeVisible()

  await intro.getByRole('button', { name: 'Skip' }).click()

  await expect(intro).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kana Game', level: 1 })).toBeVisible()
})
