import { expect, test } from '@playwright/test'
import { seedProgress } from './fixtures'

// Scope 5 (Issue #177): a representative Tracing lesson (hiragana a-row,
// the same row learn-practice.spec.ts uses) renders real SVG stroke-order
// guides, accepts a genuine pointer-driven stroke on the <canvas>, and
// Clear/reset stays usable afterward — none of which jsdom can exercise (no
// real ResizeObserver-driven layout, no <canvas> 2D context, no real
// pointer coordinates).
test('a Tracing lesson renders SVG strokes, accepts a pointer stroke, and Clear stays usable', async ({ page }) => {
  await seedProgress(page)
  await page.goto('#/practice/hiragana/a-row/tracing')

  await page.getByRole('button', { name: 'Start Tracing' }).click()
  await expect(page.getByRole('heading', { name: 'Trace each character' })).toBeVisible()

  // TracingUnitAnimation renders the stroke-order guide as real SVG paths.
  await expect(page.locator('svg').first()).toBeVisible()

  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('tracing canvas has no bounding box')

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 })
  await page.mouse.up()

  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(canvas).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
})
