import { describe, expect, it, vi } from 'vitest'
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
