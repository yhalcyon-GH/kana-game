import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFeedbackDestinationUrl, getFeedbackUrl, isFeedbackEnabled } from './config'

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

  it('buildFeedbackDestinationUrl returns undefined when unconfigured', () => {
    expect(buildFeedbackDestinationUrl({ route: '/about', buildSha: 'dev', screenSize: 'medium' })).toBeUndefined()
  })
})

describe('feedback config with a destination configured', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is enabled once VITE_FEEDBACK_URL is set', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://forms.example.com/kana-game-feedback')
    expect(isFeedbackEnabled()).toBe(true)
  })

  it('builds a destination URL carrying route/build/screen as query params, never free text', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://forms.example.com/kana-game-feedback')
    const destination = buildFeedbackDestinationUrl({ route: '/practice/hiragana/a-row', buildSha: 'abc1234', screenSize: 'small' })
    expect(destination).toBeDefined()
    const url = new URL(destination!)
    expect(url.origin + url.pathname).toBe('https://forms.example.com/kana-game-feedback')
    expect(url.searchParams.get('route')).toBe('/practice/hiragana/a-row')
    expect(url.searchParams.get('build')).toBe('abc1234')
    expect(url.searchParams.get('screen')).toBe('small')
  })

  it('preserves any existing query params already on the configured URL', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://forms.example.com/feedback?entry=1')
    const destination = buildFeedbackDestinationUrl({ route: '/about', buildSha: 'dev', screenSize: 'large' })
    const url = new URL(destination!)
    expect(url.searchParams.get('entry')).toBe('1')
    expect(url.searchParams.get('route')).toBe('/about')
  })
})
