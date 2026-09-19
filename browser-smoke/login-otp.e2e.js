import { expect, test } from '@playwright/test'
import { BROWSER_SMOKE_VALID_CODE, installProductionAuthFixture } from './production-auth-fixture.js'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
})

async function skipIntro(page) {
  const skip = page.getByRole('button', { name: 'Skip', exact: true })
  if (await skip.isVisible()) await skip.click()
}

async function goToLogin(page) {
  await page.goto('./#/login')
  await skipIntro(page)
}

function assertNoOverflow(page) {
  return page.locator('body').evaluate((body) => body.scrollWidth > body.clientWidth).then((hasOverflow) => expect(hasOverflow).toBe(false))
}

test('capability true shows the OTP email step, with no overflow at 320px', async ({ page }) => {
  await installProductionAuthFixture(page, 'signed-out', { emailCodeAuth: true })
  await goToLogin(page)
  await expect(page.getByRole('heading', { name: 'Sign in for Full Access' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible()
  await assertNoOverflow(page)
})

test('capability false/unreachable falls back to Magic Link', async ({ page }) => {
  await installProductionAuthFixture(page, 'signed-out', { emailCodeAuth: false })
  await goToLogin(page)
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send sign-in link' })).toBeVisible()
})

test('email -> code -> authenticated, with leading zeros preserved, no overflow at 320px', async ({ page }) => {
  await installProductionAuthFixture(page, 'signed-out', { emailCodeAuth: true })
  await goToLogin(page)

  await page.getByLabel('Email').fill('learner@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()

  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
  await expect(page.getByText('learner@example.com')).toBeVisible()
  await assertNoOverflow(page)

  const codeInput = page.getByLabel('6-digit code')
  await expect(codeInput).toHaveAttribute('inputmode', 'numeric')
  await expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code')
  await codeInput.fill(BROWSER_SMOKE_VALID_CODE)
  await expect(codeInput).toHaveValue(BROWSER_SMOKE_VALID_CODE)
  await codeInput.press('Enter')

  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
  await expect(page.getByText('browser-smoke@example.test')).toBeVisible()
})

test('wrong code shows the exact invalid/expired copy and never falls back to Magic Link', async ({ page }) => {
  await installProductionAuthFixture(page, 'signed-out', { emailCodeAuth: true })
  await goToLogin(page)
  await page.getByLabel('Email').fill('learner@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()

  await page.getByLabel('6-digit code').fill('999999')
  await page.getByRole('button', { name: 'Verify code' }).click()

  await expect(page.getByRole('alert')).toHaveText('Invalid or expired code. Please request a new code.')
  await expect(page.getByRole('button', { name: 'Send sign-in link' })).toHaveCount(0)
})

test('resend countdown starts at 60 seconds and Change email returns to the email step', async ({ page }) => {
  await installProductionAuthFixture(page, 'signed-out', { emailCodeAuth: true })
  await goToLogin(page)
  await page.getByLabel('Email').fill('learner@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()

  await expect(page.getByRole('button', { name: 'Resend code (60s)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resend code (60s)' })).toBeDisabled()

  await page.getByRole('button', { name: 'Change email' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in for Full Access' })).toBeVisible()
})

test('paste support fills the code input from clipboard data', async ({ page }) => {
  await installProductionAuthFixture(page, 'signed-out', { emailCodeAuth: true })
  await goToLogin(page)
  await page.getByLabel('Email').fill('learner@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()

  const codeInput = page.getByLabel('6-digit code')
  await codeInput.click()
  await page.evaluate((code) => {
    const input = document.activeElement
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text', code)
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }))
  }, '01 23-45')
  await expect(codeInput).toHaveValue('012345')
})
