import { expect, test } from '@playwright/test'

test('production excludes the Paddle Sandbox route and never loads Paddle', async ({ page }) => {
  const paddleRequests = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname.endsWith('paddle.com')) paddleRequests.push(request.url())
  })
  await page.goto('./#/paddle-test')
  // The existing intro is unrelated to the PoC; dismiss it through its UI.
  const skip = page.getByRole('button', { name: 'Skip', exact: true })
  if (await skip.isVisible()) await skip.click()
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })).toHaveCount(0)
  await expect(page.locator('script[src*="paddle.com"]')).toHaveCount(0)
  expect(paddleRequests).toEqual([])
})
