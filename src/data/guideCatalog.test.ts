import { describe, expect, it } from 'vitest'
import { GUIDE_CATALOG } from './guideCatalog'

// Issue #46: Settings' Guides list is driven entirely by this catalog, kept
// separate from SettingsPage so a future Guide is one more entry here.
describe('GUIDE_CATALOG (Issue #46/#50)', () => {
  it('lists exactly the six currently-implemented Guides, in order', () => {
    expect(GUIDE_CATALOG.map((g) => g.id)).toEqual(['intro', 'learnTracing', 'practice', 'review', 'sokuon', 'youon'])
    expect(GUIDE_CATALOG.map((g) => g.label)).toEqual([
      'Introduction',
      'Learn / Tracing',
      'Practice',
      'Review',
      'Sokuon',
      'Yōon',
    ])
  })

  it('Introduction replays via the existing global flag toggle, not navigation', () => {
    const intro = GUIDE_CATALOG.find((g) => g.id === 'intro')!
    expect(intro.kind).toBe('introFlag')
  })

  it('every in-context Guide carries a real target route', () => {
    const inContext = GUIDE_CATALOG.filter((g) => g.kind === 'replay')
    expect(inContext).toHaveLength(5)
    for (const guide of inContext) {
      expect(guide.path).toMatch(/^\//)
    }
  })

  it('Learn / Tracing and Practice both target hiragana/a-row, Sokuon targets sokuon/sokuon-row, and Yōon targets youon/youon-ka-row', () => {
    const byId = Object.fromEntries(GUIDE_CATALOG.map((g) => [g.id, g]))
    expect(byId.learnTracing.kind === 'replay' && byId.learnTracing.path).toBe('/practice/hiragana/a-row')
    expect(byId.practice.kind === 'replay' && byId.practice.path).toBe('/practice/hiragana/a-row')
    expect(byId.sokuon.kind === 'replay' && byId.sokuon.path).toBe('/practice/sokuon/sokuon-row')
    expect(byId.review.kind === 'replay' && byId.review.path).toBe('/practice/review')
    expect(byId.youon.kind === 'replay' && byId.youon.path).toBe('/practice/youon/youon-ka-row')
  })
})
