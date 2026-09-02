import { expect, test } from '@playwright/test'
import { seedProgress } from './fixtures'

// Scope 7 (Issue #177): a representative pronunciation control (a
// CharacterCard's tap-to-play button on Learn — see
// src/components/CharacterCard.tsx) can be activated without a
// learner-facing crash. Deliberately narrow: this proves the real
// <audio>/AudioContext boundary (src/audio/staticFileProvider.ts) survives
// a genuine user gesture in a real browser — it does NOT attempt
// corpus-wide audio validation or assert on audible playback/device output
// (see the issue's Guardrails).
test('activating a pronunciation control does not crash the page', async ({ page }) => {
  await seedProgress(page)
  await page.goto('#/learn/hiragana/a-row')

  const playButton = page.getByRole('button', { name: /Play pronunciation of/ })
  await expect(playButton).toBeVisible()
  await playButton.click()

  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'あ〜お・ん — new characters' })).toBeVisible()
})
