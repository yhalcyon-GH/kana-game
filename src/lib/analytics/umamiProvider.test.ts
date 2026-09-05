import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUmamiProvider } from './umamiProvider'

describe('createUmamiProvider', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'test-website-id')
    document.head.innerHTML = ''
    delete window.umami
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    document.head.innerHTML = ''
    delete window.umami
  })

  it('injects the Umami tracker script tag configured for manual tracking only', () => {
    createUmamiProvider()
    const script = document.head.querySelector('script[data-website-id="test-website-id"]')
    expect(script).not.toBeNull()
    // data-auto-track="false" is Umami's own documented mechanism for
    // disabling ALL automatic tracking (pageviews, clicks, path detection)
    // — see umamiProvider.ts's doc comment. This must never be omitted or
    // set to anything else, since it's what keeps this integration to
    // "only the events this app explicitly calls track() for."
    expect(script?.getAttribute('data-auto-track')).toBe('false')
  })

  it('defaults to the Umami Cloud host when no custom host is configured', () => {
    createUmamiProvider()
    const script = document.head.querySelector('script[data-website-id="test-website-id"]')
    expect(script?.getAttribute('src')).toBe('https://cloud.umami.is/script.js')
  })

  it('uses a configured custom host URL when set', () => {
    vi.stubEnv('VITE_UMAMI_HOST_URL', 'https://umami.example.com/')
    createUmamiProvider()
    const script = document.head.querySelector('script[data-website-id="test-website-id"]')
    expect(script?.getAttribute('src')).toBe('https://umami.example.com/script.js')
  })

  it('forwards track() calls to window.umami.track when the global is present', () => {
    const umamiTrack = vi.fn()
    window.umami = { track: umamiTrack }
    const provider = createUmamiProvider()

    provider.track('practice_completed', { category: 'hiragana', score: 8 })

    expect(umamiTrack).toHaveBeenCalledWith('practice_completed', { category: 'hiragana', score: 8 })
  })

  it('does not throw when window.umami is not yet available (script still loading)', () => {
    const provider = createUmamiProvider()
    expect(() => provider.track('lesson_started')).not.toThrow()
  })

  it('does not inject a script when no website id is configured', () => {
    vi.unstubAllEnvs()
    createUmamiProvider()
    expect(document.head.querySelector('script[data-auto-track]')).toBeNull()
  })
})
