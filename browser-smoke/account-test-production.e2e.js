import { expect, test } from '@playwright/test'

test('production excludes the dev-only Account Test harness route', async ({ page }) => {
  await page.goto('./#/account-test')
  const skip = page.getByRole('button', { name: 'Skip', exact: true })
  if (await skip.isVisible()) await skip.click()
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Account Test', exact: true })).toHaveCount(0)
})

// Phase 3B: /verify is no longer 404 in production -- it renders the
// PRODUCTION verify page (ProductionVerifyPage), never the dev-only
// harness's VerifyPage, at the same route the backend hardcodes into
// every Magic Link URL (see server/src/Auth/MagicLinkUrlBuilder.php and
// src/App.tsx's DEV-vs-production route selection for /verify). See
// src/App.accountTest.test.tsx's jsdom-level equivalent of this same
// assertion.
test('production /verify renders the production verify page, never the dev harness one or a 404', async ({ page }) => {
  await page.goto('./#/verify?token=some-token')
  const skip = page.getByRole('button', { name: 'Skip', exact: true })
  if (await skip.isVisible()) await skip.click()
  await expect(page.getByRole('heading', { name: 'Signing in…', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Verifying sign-in link…', exact: true })).toHaveCount(0)
})

test('production exposes the new /login and /account routes', async ({ page }) => {
  await page.goto('./#/login')
  let skip = page.getByRole('button', { name: 'Skip', exact: true })
  if (await skip.isVisible()) await skip.click()
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()

  await page.goto('./#/account')
  skip = page.getByRole('button', { name: 'Skip', exact: true })
  if (await skip.isVisible()) await skip.click()
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
})
