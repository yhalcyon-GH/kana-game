import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAnalyticsProvider, getUmamiHostUrl, getUmamiWebsiteId, isUmamiConfigured } from './umamiConfig'

describe('umamiConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is unconfigured by default (no env vars set)', () => {
    expect(getAnalyticsProvider()).toBeUndefined()
    expect(getUmamiWebsiteId()).toBeUndefined()
    expect(getUmamiHostUrl()).toBeUndefined()
    expect(isUmamiConfigured()).toBe(false)
  })

  it('is not configured when only the provider flag is set, with no website id', () => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'umami')
    expect(isUmamiConfigured()).toBe(false)
  })

  it('is not configured when only a website id is set, with no provider flag', () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'abc-123')
    expect(isUmamiConfigured()).toBe(false)
  })

  it('is not configured when the provider flag is set to something other than umami', () => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'plausible')
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'abc-123')
    expect(isUmamiConfigured()).toBe(false)
  })

  it('is configured once both the provider flag and a website id are set', () => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'umami')
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'abc-123')
    expect(isUmamiConfigured()).toBe(true)
    expect(getUmamiWebsiteId()).toBe('abc-123')
  })

  it('reads an optional custom host URL', () => {
    vi.stubEnv('VITE_UMAMI_HOST_URL', 'https://umami.example.com')
    expect(getUmamiHostUrl()).toBe('https://umami.example.com')
  })
})
