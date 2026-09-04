import { expect, test } from '@playwright/test'

const STABLE_GUIDE_STATE = {
  hasCompletedIntroGuide: true,
  hasCompletedLearnTracingGuide: true,
  hasCompletedPracticeGuide: true,
  hasCompletedReviewGuide: true,
  hasCompletedSokuonGuide: true,
  hasCompletedChouonGuide: true,
  hasCompletedYouonGuide: true,
  hasCompletedSpecialKatakanaGuide: true,
  hasCompletedHiraganaSectionGuide: true,
  hasCompletedKatakanaSectionGuide: true,
  hasCompletedParticleGuide: true,
}

async function seedProgressState(page, state) {
  await page.addInitScript((guideState) => {
    const key = 'kana-game-progress'
    const persisted = JSON.parse(localStorage.getItem(key) || '{}')
    localStorage.setItem(key, JSON.stringify({
      ...persisted,
      // Keep this aligned with progressStore's Zustand persist version.
      version: 20,
      state: { ...(persisted.state || {}), ...guideState },
    }))
  }, state)
}

async function seedStableLearnerState(page) {
  await seedProgressState(page, STABLE_GUIDE_STATE)
}

async function gotoHash(page, route = '/', { stable = true } = {}) {
  if (stable) await seedStableLearnerState(page)
  await page.goto(`./#${route}`)
}

async function startOrderingGame(page, route) {
  await gotoHash(page, route)
  await page.getByRole('button', { name: 'Start' }).click()
}

async function currentTargetIds(page, prefix) {
  const targetLocator = page.locator(`[data-testid^="${prefix}-target-"]:not([data-testid="${prefix}-target-bubble"])`)
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
  for (const id of ids) await page.getByTestId(`${prefix}-romaji-${id}`).click()
  if (ids.length === 2) await page.getByRole('button', { name: 'Order' }).click()
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

async function completeOrderingCheckpoint(page, route, prefix, expectedAssessmentPath) {
  await startOrderingGame(page, route)
  for (let round = 0; round < 8; round += 1) {
    await answerCurrentOrderingRound(page, prefix)
    const next = page.getByRole('button', { name: 'Next' })
    await expect(next).toBeVisible()
    await next.click()
    if (round < 7) await expect(page.getByText(/Question \d+ \/ 8/)).toBeVisible()
  }
  await expect(page.getByText('Completed!', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Next' }).click()
  await expect(page).toHaveURL(new RegExp(`#${expectedAssessmentPath}$`))
  await expect(page.getByText(/Question 1 \/ 20/)).toBeVisible()
}

async function expectNoHorizontalPageOverflow(page) {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
  return geometry
}

async function reachWordReadingQuestion(page) {
  const speakButton = page.getByTestId('word-reading-speak-button')
  for (let round = 0; round < 20; round += 1) {
    if (await speakButton.isVisible().catch(() => false)) return

    const wordBuilderSlot = page.locator('button.border-dashed').first()
    const choiceButtons = page.locator('.grid.grid-cols-2 button')
    if (await wordBuilderSlot.isVisible().catch(() => false)) {
      const emptySlots = () => page.locator('button.border-dashed').filter({ has: page.locator('span.font-kana:empty') })
      while (await emptySlots().count() > 0) {
        await page.locator('button.font-kana[aria-pressed="false"]:not(.border-dashed):not([disabled])').first().click()
      }
    } else if ((await choiceButtons.count()) > 0) {
      await choiceButtons.first().click()
    }

    const next = page.getByRole('button', { name: 'Next' })
    if (await next.isVisible().catch(() => false)) await next.click()
  }
  throw new Error('Did not reach a Word Reading question')
}

test('first launch shows the Introduction and Skip reaches Home', async ({ page }) => {
  await gotoHash(page, '/', { stable: false })
  const guide = page.getByRole('dialog', { name: 'Tamamizu Guide' })
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Next' })).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Back' })).toBeDisabled()
  await guide.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('heading', { name: 'Kana Game' })).toBeVisible()
})

test('fresh learner sees and dismisses the Sokuon Guide with a normal click', async ({ page }) => {
  await seedProgressState(page, { hasCompletedIntroGuide: true })
  await gotoHash(page, '/other', { stable: false })
  const guide = page.getByTestId('sokuon-guide')
  await expect(guide).toBeVisible()
  await guide.getByRole('button').click()
  await expect(guide).toBeHidden()
})

test('representative Learn flow can return to the row Practice Hub', async ({ page }) => {
  await gotoHash(page, '/learn/hiragana/a-row')
  await expect(page.getByRole('heading', { name: /new characters/i })).toBeVisible()
  await page.getByRole('button', { name: 'See the words' }).click()
  await expect(page.getByRole('button', { name: 'Back to hub' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to hub' }).click()
  await expect(page).toHaveURL(/#\/practice\/hiragana\/a-row$/)
  await expect(page.getByText('Tracing', { exact: true })).toBeVisible()
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
  expect(await answerCurrentOrderingRound(page, 'restaurant')).toHaveLength(2)
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

  expect(await answerCurrentOrderingRound(page, 'cafe')).toHaveLength(2)
  await expect(bubble.locator('img')).toHaveCount(2)
})

test('Tracing renders in a real browser, accepts a stroke, and Clear resets it', async ({ page }) => {
  await gotoHash(page, '/practice/hiragana/a-row/tracing')
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
})

test('unmatched routes show recovery UI and Go Home restores Home', async ({ page }) => {
  await gotoHash(page, '/this-route-does-not-exist')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Go Home' }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { name: 'Kana Game' })).toBeVisible()
})

test('Hiragana and Katakana Tests both load at 320px without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  for (const script of ['hiragana', 'katakana']) {
    await gotoHash(page, `/assessment/${script}`)
    await expect(page.getByText(/Question 1 \/ 20/)).toBeVisible()
    await expectNoHorizontalPageOverflow(page)
  }
})

test('Sokuon/Chōon Test loads and reveals the blank answer at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await gotoHash(page, '/assessment/sokuon-chouon')
  const assessment = page.getByTestId('sound-length-assessment')
  await expect(assessment.getByText(/Question 1 \/ 20/)).toBeVisible()
  await expect(page.getByTestId('sound-length-prompt')).toBeVisible()
  await expect(page.getByTestId('sound-length-blank')).toBeVisible()
  await expectNoHorizontalPageOverflow(page)
  const answerChoices = assessment.locator('div.grid button')
  let sawNoInsertionContrast = false
  for (let questionNumber = 1; questionNumber <= 20; questionNumber++) {
    await expect(assessment.getByText(`Question ${questionNumber} / 20`)).toBeVisible()
    const noInsertion = answerChoices.filter({ hasText: '×' })
    await noInsertion.click()
    if ((await noInsertion.getAttribute('class'))?.includes('border-green-500')) sawNoInsertionContrast = true
    const next = assessment.getByRole('button', { name: 'Next' })
    await expect(next).toBeVisible()
    if (questionNumber === 1) {
      await page.waitForTimeout(1100)
      await expect(assessment.getByText('Question 1 / 20')).toBeVisible()
    }
    await next.click()
  }
  expect(sawNoInsertionContrast).toBe(true)
  await expect(page.getByTestId('assessment-result-status')).toHaveText(/FAIL|PASS|PERFECT/)
  const resultImage = page.getByTestId('assessment-result-image')
  await expect(resultImage).toBeVisible()
  await expect.poll(() => resultImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0)
  await expectNoHorizontalPageOverflow(page)
})

test('Section Test cards stay visible and navigate at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  for (const [section, cardId, route] of [
    ['/hiragana', 'assessment-card-hiragana', '/assessment/hiragana'],
    ['/katakana', 'assessment-card-katakana', '/assessment/katakana'],
    ['/other', 'assessment-card-sokuon-chouon', '/assessment/sokuon-chouon'],
    ['/youon', 'assessment-card-youon-special-katakana', '/assessment/youon-special-katakana'],
    ['/youon', 'assessment-card-final-graduation', '/assessment/final-graduation'],
  ]) {
    await gotoHash(page, section)
    const card = page.getByTestId(cardId)
    await expect(card).toBeVisible()
    await expect(card).toContainText('80%+ to pass')
    await expectNoHorizontalPageOverflow(page)
    await card.click()
    await expect(page).toHaveURL(new RegExp(`#${route.replace('/', '\\/')}`))
  }
})

test('Katakana Test card shows a persisted PERFECT result clearly', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await seedProgressState(page, {
    assessmentCompletion: {
      katakana: { completed: true, lastScore: { correct: 20, total: 20 }, completedAt: 1 },
    },
  })
  await gotoHash(page, '/katakana')
  const card = page.getByTestId('assessment-card-katakana')
  await expect(card.getByTestId('assessment-card-katakana-status')).toHaveText('👑 PERFECT')
  await expect(card.getByTestId('assessment-card-katakana-score')).toHaveText('20/20')
  await expectNoHorizontalPageOverflow(page)
})

test('long Word Builder stays within 320px and placed tiles can return from the tray', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await gotoHash(page, '/practice/special-katakana/special-katakana-she-row/word-builder')

  for (let round = 1; round <= 8; round += 1) {
    const progress = page.getByText(new RegExp(`Round ${round} / 8`))
    await expect(progress).toBeVisible()
    const slots = page.locator('button.border-dashed')
    if (await slots.count() >= 5) {
      await expectNoHorizontalPageOverflow(page)
      const slotGroup = slots.first().locator('..')
      const box = await slotGroup.boundingBox()
      expect(box).not.toBeNull()
      expect(box.x + box.width).toBeLessThanOrEqual(320.5)

      const unplacedTiles = page.locator('button.font-kana[aria-pressed="false"]:not(.border-dashed):not([disabled])')
      const initialUnplacedCount = await unplacedTiles.count()
      await unplacedTiles.first().click()
      const placedTile = page.locator('button.font-kana[aria-pressed="true"]:not(.border-dashed):not([disabled])')
      await expect(placedTile).toHaveCount(1)
      await placedTile.click()
      await expect(placedTile).toHaveCount(0)
      await expect(unplacedTiles).toHaveCount(initialUnplacedCount)
      return
    }

    while (await slots.locator('span.font-kana:empty').count() > 0) {
      await page.locator('button.font-kana[aria-pressed="false"]:not(.border-dashed):not([disabled])').first().click()
    }
    const next = page.getByRole('button', { name: 'Next' })
    if (await next.isVisible().catch(() => false)) await next.click()
    else await expect(progress).toBeHidden({ timeout: 3500 })
  }
  throw new Error('Did not reach a long real Word Builder word')
})

test('Final Graduation Test loads at 320px without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await gotoHash(page, '/assessment/final-graduation')
  await expect(page.getByText(/Question 1 \/ 30/)).toBeVisible()
  await expectNoHorizontalPageOverflow(page)
})

test('Word Reading hides clues before answer and reveals answer data afterward', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await gotoHash(page, '/assessment/hiragana')
  await reachWordReadingQuestion(page)

  await expect(page.getByTestId('word-reading-speak-button')).toBeVisible()
  await expect(page.getByTestId('word-reading-reveal')).toHaveCount(0)
  await expectNoHorizontalPageOverflow(page)

  await page.getByRole('button', { name: 'Choose in Romaji' }).click()
  await page.getByTestId('word-reading-romaji-correct').click()

  const reveal = page.getByTestId('word-reading-reveal')
  await expect(reveal).toBeVisible()
  await expect(reveal.getByTestId('word-reading-image')).toBeVisible()
  await expect(reveal.getByText(/Correct!/)).toBeVisible()
  await expectNoHorizontalPageOverflow(page)
})

test('final Hiragana and Katakana Restaurant checkpoints route to their section Tests', async ({ page }) => {
  await completeOrderingCheckpoint(page, '/restaurant/hiragana-complete', 'restaurant', '/assessment/hiragana')
  await completeOrderingCheckpoint(page, '/restaurant/katakana-complete', 'restaurant', '/assessment/katakana')
})

test('representative pronunciation asset is served and its browser control activates safely', async ({ page }) => {
  await gotoHash(page, '/learn/hiragana/a-row')
  const assetStatus = await page.evaluate(async () => {
    const url = new URL('audio/characters/a.mp3', document.baseURI)
    const response = await fetch(url, { cache: 'no-store' })
    return response.status
  })
  expect(assetStatus).toBe(200)
  const pronunciation = page.getByRole('button', { name: 'Play pronunciation of あ' })
  await expect(pronunciation).toBeVisible()
  await pronunciation.click()
  await page.waitForTimeout(250)
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0)
})
