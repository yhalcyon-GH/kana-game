import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAnalyticsProvider, getUmamiHostUrl, getUmamiWebsiteId, isUmamiConfigured, isUmamiHostAllowed } from './umamiConfig'

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

// Same-origin enforcement — audit #391 hardening: Production must never
// execute analytics JavaScript from a different origin than the Tamamizu
// page itself, so a configured Umami host is only ever "allowed" when its
// resolved origin exactly matches the page's own origin.
describe('isUmamiHostAllowed', () => {
  it('allows a host whose resolved origin exactly matches the page origin', () => {
    expect(isUmamiHostAllowed('https://app.tamamizu.giganihongo.com', 'https://app.tamamizu.giganihongo.com')).toBe(
      true,
    )
  })

  it('allows a same-origin host even with a path/trailing slash, since only the origin is compared', () => {
    expect(isUmamiHostAllowed('https://app.tamamizu.giganihongo.com/', 'https://app.tamamizu.giganihongo.com')).toBe(
      true,
    )
  })

  it('rejects the previously-implicit Umami Cloud default host as cross-origin', () => {
    expect(isUmamiHostAllowed('https://cloud.umami.is', 'https://app.tamamizu.giganihongo.com')).toBe(false)
  })

  it('rejects any other cross-origin host', () => {
    expect(isUmamiHostAllowed('https://umami.example.com', 'https://app.tamamizu.giganihongo.com')).toBe(false)
  })

  it('rejects a same-domain host on a different scheme or port (origin must match exactly)', () => {
    expect(isUmamiHostAllowed('http://app.tamamizu.giganihongo.com', 'https://app.tamamizu.giganihongo.com')).toBe(
      false,
    )
    expect(
      isUmamiHostAllowed('https://app.tamamizu.giganihongo.com:8443', 'https://app.tamamizu.giganihongo.com'),
    ).toBe(false)
  })

  it('rejects an unparseable host URL rather than throwing', () => {
    expect(isUmamiHostAllowed('not-a-url', 'https://app.tamamizu.giganihongo.com')).toBe(false)
  })
})
