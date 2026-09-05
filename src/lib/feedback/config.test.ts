import { describe, expect, it } from 'vitest'
import { getFeedbackUrl, isFeedbackEnabled } from './config'

// VITE_FEEDBACK_URL is unset in every test/dev/CI environment for this
// release (no destination has been chosen yet — see
// docs/analytics-foundation.md), so this proves the disabled-by-default
// behavior specifically.
describe('feedback config', () => {
  it('is disabled when no feedback URL is configured', () => {
    expect(isFeedbackEnabled()).toBe(false)
  })

  it('returns no URL when unconfigured', () => {
    expect(getFeedbackUrl()).toBeUndefined()
  })
})
