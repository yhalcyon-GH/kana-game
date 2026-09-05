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

  it('forwards track() calls using the single-object payload form, not (eventName, eventData)', () => {
    const umamiTrack = vi.fn()
    window.umami = { track: umamiTrack }
    const provider = createUmamiProvider()

    provider.track('practice_completed', { category: 'hiragana', score: 8 })

    // Umami's track(eventName, eventData) form merges in default
    // properties (hostname/language/referrer/screen/title/url) that this
    // project must never send — see umamiProvider.ts's P1 fix comment.
    // The single-object form only sends exactly what's in the object, so
    // this call must be a single argument, not two.
    expect(umamiTrack).toHaveBeenCalledTimes(1)
    expect(umamiTrack.mock.calls[0]).toHaveLength(1)
    expect(umamiTrack).toHaveBeenCalledWith({
      website: 'test-website-id',
      name: 'practice_completed',
      data: { category: 'hiragana', score: 8 },
    })
  })

  it('omits the data field entirely when no properties are passed, rather than sending an empty object', () => {
    const umamiTrack = vi.fn()
    window.umami = { track: umamiTrack }
    const provider = createUmamiProvider()

    provider.track('lesson_started')

    expect(umamiTrack).toHaveBeenCalledWith({ website: 'test-website-id', name: 'lesson_started' })
  })

  it('never includes hostname/language/referrer/screen/title/url in the outgoing payload', () => {
    const umamiTrack = vi.fn()
    window.umami = { track: umamiTrack }
    const provider = createUmamiProvider()

    provider.track('assessment_completed', { assessment: 'hiragana', score: 18, questionCount: 20 })

    const sentPayload = umamiTrack.mock.calls[0][0]
    for (const forbiddenField of ['hostname', 'language', 'referrer', 'screen', 'title', 'url']) {
      expect(sentPayload).not.toHaveProperty(forbiddenField)
    }
    expect(Object.keys(sentPayload).sort()).toEqual(['data', 'name', 'website'])
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

  it('does not send anything when no website id is configured (no crash either)', () => {
    vi.unstubAllEnvs()
    const umamiTrack = vi.fn()
    window.umami = { track: umamiTrack }
    const provider = createUmamiProvider()

    expect(() => provider.track('lesson_started')).not.toThrow()
    expect(umamiTrack).not.toHaveBeenCalled()
  })
})
