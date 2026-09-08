import { expect, test } from '@playwright/test'

test('production excludes the Account Test and Verify routes', async ({ page }) => {
  await page.goto('./#/account-test')
  const skip = page.getByRole('button', { name: 'Skip', exact: true })
  if (await skip.isVisible()) await skip.click()
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Account Test', exact: true })).toHaveCount(0)

  await page.goto('./#/verify?token=some-token')
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Verifying sign-in link…', exact: true })).toHaveCount(0)
})
