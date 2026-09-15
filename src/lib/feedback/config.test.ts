import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFeedbackDestinationUrl, getFeedbackUrl, isFeedbackEnabled } from './config'

// VITE_FEEDBACK_URL is unset in every test/dev/CI environment for this
// release, so this proves the disabled-by-default behavior specifically.
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

  it('is enabled only for a published HTTPS Tally form URL', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/Kana123?source=tamamizu')
    expect(isFeedbackEnabled()).toBe(true)
    expect(getFeedbackUrl()).toBe('https://tally.so/r/Kana123?source=tamamizu')
  })

  it.each([
    'https://forms.example.com/kana-game-feedback',
    'https://tally.so/not-a-form',
    'http://tally.so/r/Kana123',
    'https://tally.so/r/not-valid!',
    'not a URL',
  ])('stays disabled for an unreviewed or malformed destination: %s', (value) => {
    vi.stubEnv('VITE_FEEDBACK_URL', value)
    expect(isFeedbackEnabled()).toBe(false)
    expect(getFeedbackUrl()).toBeUndefined()
    expect(buildFeedbackDestinationUrl({ route: '/about', buildSha: 'dev', screenSize: 'large' })).toBeUndefined()
  })

  it('builds a Tally destination carrying route/build/screen as query params, never free text', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/Kana123')
    const destination = buildFeedbackDestinationUrl({ route: '/practice/hiragana/a-row', buildSha: 'abc1234', screenSize: 'small' })
    expect(destination).toBeDefined()
    const url = new URL(destination!)
    expect(url.origin + url.pathname).toBe('https://tally.so/r/Kana123')
    expect(url.searchParams.get('route')).toBe('/practice/hiragana/a-row')
    expect(url.searchParams.get('build')).toBe('abc1234')
    expect(url.searchParams.get('screen')).toBe('small')
  })

  it('preserves any existing query params on a valid Tally URL', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/Kana123?entry=1')
    const destination = buildFeedbackDestinationUrl({ route: '/about', buildSha: 'dev', screenSize: 'large' })
    const url = new URL(destination!)
    expect(url.searchParams.get('entry')).toBe('1')
    expect(url.searchParams.get('route')).toBe('/about')
  })
})
