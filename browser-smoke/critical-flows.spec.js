import { expect, test } from '@playwright/test'

async function gotoHash(page, route = '/') {
  await page.goto(`./#${route}`)
}

async function dismissIntroIfPresent(page) {
  const guide = page.getByRole('dialog', { name: 'Tamamizu Guide' })
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Skip' }).click()
    await expect(guide).toBeHidden()
  }
}

async function startOrderingGame(page, route) {
  await gotoHash(page, route)
  await dismissIntroIfPresent(page)
  await page.getByRole('button', { name: 'Start' }).click()
}

async function currentTargetIds(page, prefix) {
  const targetLocator = page.locator(`[data-testid^="${prefix}-target-"]`)
  const testIds = await targetLocator.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')))
  return testIds.filter(Boolean).map((testId) => testId.slice(`${prefix}-target-`.length))
}

async function answerCurrentOrderingRound(page, prefix) {
  const fallback = page.getByTestId(`${prefix}-romaji-fallback`)
  if (!(await fallback.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Choose in Romaji' }).click()
    await expect(fallback).toBeVisible()
  }

  const ids = await currentTargetIds(page, prefix)
  expect(ids.length).toBeGreaterThan(0)
  for (const id of ids) {
    await page.getByTestId(`${prefix}-romaji-${id}`).click()
  }
  if (ids.length === 2) {
    await page.getByRole('button', { name: 'Order' }).click()
  }
  await expect(page.getByText('Great!', { exact: true })).toBeVisible()
  return ids
}

async function reachTwoItemOrderingRound(page, prefix) {
  for (let round = 0; round < 8; round += 1) {
    const ids = await currentTargetIds(page, prefix)
    if (ids.length === 2) return ids

    await answerCurrentOrderingRound(page, prefix)
    const next = page.getByRole('button', { name: 'Next' })
    await expect(next).toBeVisible()
    await next.click()
    await expect(page.getByText(/Question \d+ \/ 8/)).toBeVisible()
  }
  throw new Error(`Did not reach a two-item ${prefix} ordering round`)
}

async function expectNoHorizontalPageOverflow(page) {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
  return geometry
}

test('first launch shows the Introduction and Skip reaches Home', async ({ page }) => {
  await gotoHash(page)

  const guide = page.getByRole('dialog', { name: 'Tamamizu Guide' })
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Next' })).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Back' })).toBeDisabled()

  await guide.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('heading', { name: 'Kana Game' })).toBeVisible()
})

test('representative Learn flow can return to the row Practice Hub', async ({ page }) => {
  await gotoHash(page, '/learn/hiragana/a-row')
  await dismissIntroIfPresent(page)

  await expect(page.getByRole('heading', { name: /new characters/i })).toBeVisible()
  await page.getByRole('button', { name: 'See the words' }).click()
  await expect(page.getByRole('button', { name: 'Back to hub' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to hub' }).click()

  await expect(page).toHaveURL(/#\/practice\/hiragana\/a-row$/)
  await expect(page.getByRole('link', { name: /Tracing/i })).toBeVisible()
})

test('Restaurant two-item ordering stays usable without 320px overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await startOrderingGame(page, '/restaurant/na-row')
  await reachTwoItemOrderingRound(page, 'restaurant')

  await expect(page.getByTestId('restaurant-menu')).toBeVisible()
  await expect(page.getByTestId('restaurant-target-bubble')).toBeVisible()
  const geometry = await expectNoHorizontalPageOverflow(page)
  const templateBox = await page.getByTestId('restaurant-order-template').boundingBox()
  expect(templateBox).not.toBeNull()
  expect(templateBox.x + templateBox.width).toBeLessThanOrEqual(geometry.clientWidth + 0.5)

  const ids = await answerCurrentOrderingRound(page, 'restaurant')
  expect(ids).toHaveLength(2)
})

test('Cafe keeps target clues hidden before answer and has no 320px overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await startOrderingGame(page, '/cafe/katakana-ha-row')
  await reachTwoItemOrderingRound(page, 'cafe')

  const bubble = page.getByTestId('cafe-target-bubble')
  await expect(page.getByTestId('cafe-menu')).toBeVisible()
  await expect(bubble).toContainText("Order what's marked")
  await expect(bubble.locator('img')).toHaveCount(0)
  expect(await bubble.locator('[data-testid^="cafe-target-"]').allTextContents()).toEqual(['', ''])

  const geometry = await expectNoHorizontalPageOverflow(page)
  const templateBox = await page.getByTestId('cafe-order-template').boundingBox()
  expect(templateBox).not.toBeNull()
  expect(templateBox.x + templateBox.width).toBeLessThanOrEqual(geometry.clientWidth + 0.5)

  const ids = await answerCurrentOrderingRound(page, 'cafe')
  expect(ids).toHaveLength(2)
  await expect(bubble.locator('img')).toHaveCount(2)
  const revealedText = await bubble.locator('[data-testid^="cafe-target-"]').allTextContents()
  expect(revealedText.every((text) => text.trim().length > 0)).toBe(true)
})

test('Tracing renders in a real browser, accepts a stroke, and Clear resets it', async ({ page }) => {
  await gotoHash(page, '/practice/hiragana/a-row/tracing')
  await dismissIntroIfPresent(page)

  await page.getByRole('button', { name: 'Start Tracing' }).click()
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  await expect(page.locator('svg').first()).toBeVisible()

  const before = await canvas.evaluate((element) => element.toDataURL())
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 8 })
  await page.mouse.up()
  const afterStroke = await canvas.evaluate((element) => element.toDataURL())
  expect(afterStroke).not.toBe(before)

  await page.getByRole('button', { name: 'Clear' }).click()
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(afterStroke)
  await expect(canvas).toBeVisible()
})

test('unmatched routes show recovery UI and Go Home restores Home', async ({ page }) => {
  await gotoHash(page, '/this-route-does-not-exist')
  await dismissIntroIfPresent(page)

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Go Home' }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { name: 'Kana Game' })).toBeVisible()
})

test('representative pronunciation asset loads when its real browser control is activated', async ({ page }) => {
  await gotoHash(page, '/learn/hiragana/a-row')
  await dismissIntroIfPresent(page)

  const pronunciation = page.getByRole('button', { name: /^Play pronunciation of / }).first()
  await expect(pronunciation).toBeVisible()
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/audio/characters/') && response.status() === 200,
    { timeout: 10_000 },
  )
  await pronunciation.click()
  const response = await responsePromise
  expect(response.ok()).toBe(true)
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0)
})
