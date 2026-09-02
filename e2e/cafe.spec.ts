import { expect, test } from '@playwright/test'
import { seedProgress } from './fixtures'

test.use({ viewport: { width: 320, height: 720 } })

// Scope 4 (Issue #177): a representative two-item Cafe question (Q5-8 —
// same guaranteed-by-Q5 shape as Restaurant, see restaurant.spec.ts) fits a
// 320px viewport with no horizontal overflow, keeps the target dish's
// meaning/image hidden until answered (Cafe's whole point — see
// CafePage.tsx's file comment), and leaves normal learner controls (Back,
// Romaji fallback) usable throughout.
test('a two-item Cafe question fits a 320px viewport, hides the answer until revealed, and stays answerable', async ({
  page,
}) => {
  await seedProgress(page)
  await page.goto('#/cafe/katakana-ha-row')

  await page.getByRole('button', { name: 'Start' }).click()

  for (let question = 1; question <= 4; question++) {
    await expect(page.getByText(`Question ${question} / 8`)).toBeVisible()
    await page.getByRole('button', { name: 'Choose in Romaji' }).click()
    await page.locator('[data-testid^="cafe-romaji-"]').first().click()
    await page.getByRole('button', { name: 'Next' }).click()
  }

  await expect(page.getByText('Question 5 / 8')).toBeVisible()

  const isOverflowingX = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(isOverflowingX).toBe(false)

  const bubble = page.getByTestId('cafe-target-bubble')
  await expect(bubble.getByText("Order what's marked", { exact: false })).toBeVisible()
  await expect(bubble.locator('img')).toHaveCount(0)

  await page.getByRole('button', { name: 'Choose in Romaji' }).click()
  const romajiChoices = page.locator('[data-testid^="cafe-romaji-"]')
  await romajiChoices.nth(0).click()
  await romajiChoices.nth(1).click()
  await page.getByRole('button', { name: 'Order' }).click()

  await expect(bubble.getByText("Order what's marked", { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()

  const backLink = page.getByRole('link', { name: /Back/ })
  await expect(backLink).toBeVisible()
  await backLink.click()
  await expect(page).toHaveURL(/#\/katakana$/)
})
