import { afterEach, describe, expect, it, vi } from 'vitest'
import { noopProvider } from './noopProvider'
import { track, trackWith } from './track'
import type { AnalyticsProvider } from './types'

describe('analytics track()', () => {
  it('does not throw when called with an event and no properties', () => {
    expect(() => track('lesson_started')).not.toThrow()
  })

  it('does not throw when called with properties', () => {
    expect(() => track('lesson_completed', { category: 'hiragana', row: 'a-row', score: 8 })).not.toThrow()
  })

  it('the noop provider never throws and does nothing observable', () => {
    expect(() => noopProvider.track('graduated', { assessment: 'final-graduation' })).not.toThrow()
  })
})

describe('trackWith()', () => {
  it('forwards the event and properties to the given provider', () => {
    const provider: AnalyticsProvider = { track: vi.fn() }
    trackWith(provider, 'restaurant_started', { category: 'hiragana' })
    expect(provider.track).toHaveBeenCalledWith('restaurant_started', { category: 'hiragana' })
  })

  it('swallows an exception thrown by the provider instead of propagating it', () => {
    const throwingProvider: AnalyticsProvider = {
      track: () => {
        throw new Error('provider exploded')
      },
    }
    expect(() => trackWith(throwingProvider, 'cafe_started')).not.toThrow()
  })
})

// activeProvider is computed once at module load from env config — these
// tests re-import the module fresh (vi.resetModules) after stubbing env
// vars, to prove the actual selection wiring in track.ts (not just
// isUmamiConfigured()/createUmamiProvider() in isolation, which have their
// own dedicated test files).
describe('activeProvider selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    document.head.innerHTML = ''
    delete window.umami
  })

  it('delegates to the Umami provider when a valid provider+website-id config is present', async () => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'umami')
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'test-id')
    vi.resetModules()
    const umamiTrack = vi.fn()
    window.umami = { track: umamiTrack }

    const { track: freshTrack } = await import('./track')
    freshTrack('lesson_started')

    // Single-object payload form (P1 fix, PR #210 final review) — see
    // umamiProvider.test.ts for the dedicated payload-shape coverage.
    expect(umamiTrack).toHaveBeenCalledWith({ website: 'test-id', name: 'lesson_started' })
  })

  it('falls back to a safe non-Umami provider with malformed/missing config, and never throws', async () => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'umami')
    // Deliberately missing VITE_UMAMI_WEBSITE_ID — malformed/incomplete config.
    vi.resetModules()

    const { track: freshTrack } = await import('./track')
    expect(() => freshTrack('lesson_started')).not.toThrow()
    // No Umami script should have been injected for an incomplete config.
    expect(document.head.querySelector('script[data-auto-track]')).toBeNull()
  })
})
