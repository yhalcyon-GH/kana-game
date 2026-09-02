import { expect, test } from '@playwright/test'
import { seedProgress } from './fixtures'

// Scope 2 (Issue #177): Learn -> Practice Hub for a representative
// Hiragana row (a-row, unlocked by default — see progressStore.ts's
// FIRST_ROW_ID) — proving real hash-based routing/rendering end to end,
// not duplicating LearnPage/PracticeHubPage's own Vitest coverage.
test('a representative Hiragana row renders through Learn, and the Practice Hub is reachable', async ({ page }) => {
  await seedProgress(page)
  await page.goto('')

  await page.locator('main').getByRole('link', { name: 'Hiragana' }).click()
  await expect(page).toHaveURL(/#\/hiragana$/)

  await page.locator('main a[href="#/practice/hiragana/a-row"]').click()
  await expect(page).toHaveURL(/#\/practice\/hiragana\/a-row$/)
  await expect(page.getByRole('heading', { name: 'あ〜お・ん' })).toBeVisible()

  await page.locator('main a[href="#/learn/hiragana/a-row"]').click()
  await expect(page).toHaveURL(/#\/learn\/hiragana\/a-row$/)
  await expect(page.getByRole('heading', { name: 'あ〜お・ん — new characters' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Play pronunciation of/ })).toBeVisible()

  // Learn's own "Back" from its very first character returns straight to
  // the Practice Hub (see LearnPage.tsx's handlePrevChar) — the shortest
  // real path back that proves the Hub is reachable again.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/#\/practice\/hiragana\/a-row$/)
  await expect(page.getByRole('heading', { name: 'あ〜お・ん' })).toBeVisible()
})
