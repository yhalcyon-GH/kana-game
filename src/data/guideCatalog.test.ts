import { describe, expect, it } from 'vitest'
import { GUIDE_CATALOG } from './guideCatalog'

// Issue #46: Settings' Guides list is driven entirely by this catalog, kept
// separate from SettingsPage so a future Guide is one more entry here.
describe('GUIDE_CATALOG (Issue #46)', () => {
  it('lists exactly the five currently-implemented Guides, in order', () => {
    expect(GUIDE_CATALOG.map((g) => g.id)).toEqual(['intro', 'learnTracing', 'practice', 'review', 'sokuon'])
    expect(GUIDE_CATALOG.map((g) => g.label)).toEqual(['Introduction', 'Learn / Tracing', 'Practice', 'Review', 'Sokuon'])
  })

  it('Introduction replays via the existing global flag toggle, not navigation', () => {
    const intro = GUIDE_CATALOG.find((g) => g.id === 'intro')!
    expect(intro.kind).toBe('introFlag')
  })

  it('every in-context Guide carries a real target route', () => {
    const inContext = GUIDE_CATALOG.filter((g) => g.kind === 'replay')
    expect(inContext).toHaveLength(4)
    for (const guide of inContext) {
      expect(guide.path).toMatch(/^\//)
    }
  })

  it('Learn / Tracing and Practice both target hiragana/a-row, and Sokuon targets sokuon/sokuon-row', () => {
    const byId = Object.fromEntries(GUIDE_CATALOG.map((g) => [g.id, g]))
    expect(byId.learnTracing.kind === 'replay' && byId.learnTracing.path).toBe('/practice/hiragana/a-row')
    expect(byId.practice.kind === 'replay' && byId.practice.path).toBe('/practice/hiragana/a-row')
    expect(byId.sokuon.kind === 'replay' && byId.sokuon.path).toBe('/practice/sokuon/sokuon-row')
    expect(byId.review.kind === 'replay' && byId.review.path).toBe('/practice/review')
  })
})
