import { expect, test } from '@playwright/test'
import { seedProgress } from './fixtures'

test.use({ viewport: { width: 320, height: 720 } })

// Scope 3 (Issue #177): a representative two-item Restaurant question
// (Q5-8 — see hooks/useOrderingGame.ts's `isTwoTargetRound`, always true by
// Q5 regardless of which dishes are randomly picked) fits a 320px viewport
// with no horizontal page overflow and stays answerable. Speech input is
// never exercised here — headless Chromium has no SpeechRecognition/mic
// (see RestaurantPage.tsx's `!speechSupported` fallback copy) — so this
// sticks to the Romaji fallback every learner without a working mic already
// uses, matching the issue's "no audible-device assertions" guardrail.
test('a two-item Restaurant question fits a 320px viewport and stays answerable', async ({ page }) => {
  await seedProgress(page)
  await page.goto('#/restaurant/na-row')

  await page.getByRole('button', { name: 'Start' }).click()

  // Q1-4 are single-item rounds — clear each as fast as possible (any
  // Romaji pick reveals and unlocks Next) purely to reach the guaranteed
  // two-item Q5; single-item rounds already have full Vitest coverage.
  for (let question = 1; question <= 4; question++) {
    await expect(page.getByText(`Question ${question} / 8`)).toBeVisible()
    await page.getByRole('button', { name: 'Choose in Romaji' }).click()
    await page.locator('[data-testid^="restaurant-romaji-"]').first().click()
    await page.getByRole('button', { name: 'Next' }).click()
  }

  await expect(page.getByText('Question 5 / 8')).toBeVisible()

  const isOverflowingX = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(isOverflowingX).toBe(false)

  await page.getByRole('button', { name: 'Choose in Romaji' }).click()
  const romajiChoices = page.locator('[data-testid^="restaurant-romaji-"]')
  await romajiChoices.nth(0).click()
  await romajiChoices.nth(1).click()
  await page.getByRole('button', { name: 'Order' }).click()

  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
})
