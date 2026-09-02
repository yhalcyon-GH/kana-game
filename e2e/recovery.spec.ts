import { expect, test } from '@playwright/test'
import { seedProgress } from './fixtures'

// Scope 6 (Issue #177): a genuine unmatched route — the app uses HashRouter
// for GitHub Pages, see src/main.tsx's comment — renders the learner-facing
// not-found state (App.tsx's NotFoundPage), and Go Home recovers to Home,
// proven through real routing rather than a MemoryRouter test double.
test('an unmatched route recovers to Home via Go Home', async ({ page }) => {
  await seedProgress(page)
  await page.goto('#/this-route-does-not-exist-e2e')

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

  await page.getByRole('link', { name: 'Go Home' }).click()

  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { name: 'Kana Game', level: 1 })).toBeVisible()
})
