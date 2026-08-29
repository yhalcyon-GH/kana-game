import { describe, expect, it } from 'vitest'
import { CONCEPT_GUIDE_CATALOG, GUIDE_CATALOG, TUTORIAL_CATALOG } from './guideCatalog'

// Issue #46: Settings' Tutorials list is driven entirely by TUTORIAL_CATALOG
// (a filtered view of this catalog), kept separate from SettingsPage so a
// future Tutorial is one more entry here. Sokuon/Chōon/Yōon remain as
// 'concept' entries — hidden from Settings but preserved intact for a
// future PR to surface from within each curriculum section.
describe('GUIDE_CATALOG (Issue #46/#50/Chōon Guide/Tutorials)', () => {
  it('lists exactly the nine currently-implemented Guides, in order', () => {
    expect(GUIDE_CATALOG.map((g) => g.id)).toEqual([
      'intro',
      'learnTracing',
      'practice',
      'review',
      'sokuon',
      'chouon',
      'youon',
      'specialKatakana',
      'particle',
    ])
  })

  it('TUTORIAL_CATALOG holds exactly the 4 Settings-visible tutorial entries', () => {
    expect(TUTORIAL_CATALOG.map((g) => g.id)).toEqual(['intro', 'learnTracing', 'practice', 'review'])
    expect(TUTORIAL_CATALOG.map((g) => g.label)).toEqual([
      'How does KanaGame work?',
      'How do I learn & trace?',
      'How does Practice work?',
      'How does Review work?',
    ])
  })

  it('CONCEPT_GUIDE_CATALOG preserves Sokuon/Chōon/Yōon/Special Katakana/Particle replay info intact, unsurfaced in Settings', () => {
    expect(CONCEPT_GUIDE_CATALOG.map((g) => g.id)).toEqual(['sokuon', 'chouon', 'youon', 'specialKatakana', 'particle'])
    expect(CONCEPT_GUIDE_CATALOG.map((g) => g.label)).toEqual(['Sokuon', 'Chōon', 'Yōon', 'Special Katakana', 'Particle'])
  })

  it('Particle Guide is registered as a concept Guide targeting /hiragana, and is absent from TUTORIAL_CATALOG', () => {
    const particle = GUIDE_CATALOG.find((g) => g.id === 'particle')!
    expect(particle).toMatchObject({ id: 'particle', label: 'Particle', kind: 'replay', path: '/hiragana', category: 'concept' })
    expect(TUTORIAL_CATALOG.map((g) => g.id)).not.toContain('particle')
  })

  it('Introduction replays via the existing global flag toggle, not navigation', () => {
    const intro = GUIDE_CATALOG.find((g) => g.id === 'intro')!
    expect(intro.kind).toBe('introFlag')
  })

  it('every in-context Guide carries a real target route', () => {
    const inContext = GUIDE_CATALOG.filter((g) => g.kind === 'replay')
    expect(inContext).toHaveLength(8)
    for (const guide of inContext) {
      expect(guide.path).toMatch(/^\//)
    }
  })

  it('Learn / Tracing and Practice both target hiragana/a-row, Sokuon targets sokuon/sokuon-row, Chōon targets chouon/chouon-a-row, Yōon targets youon/youon-ka-row, and Special Katakana targets special-katakana/special-katakana-fa-row', () => {
    const byId = Object.fromEntries(GUIDE_CATALOG.map((g) => [g.id, g]))
    expect(byId.learnTracing.kind === 'replay' && byId.learnTracing.path).toBe('/practice/hiragana/a-row')
    expect(byId.practice.kind === 'replay' && byId.practice.path).toBe('/practice/hiragana/a-row')
    expect(byId.sokuon.kind === 'replay' && byId.sokuon.path).toBe('/practice/sokuon/sokuon-row')
    expect(byId.review.kind === 'replay' && byId.review.path).toBe('/practice/review')
    expect(byId.chouon.kind === 'replay' && byId.chouon.path).toBe('/practice/chouon/chouon-a-row')
    expect(byId.youon.kind === 'replay' && byId.youon.path).toBe('/practice/youon/youon-ka-row')
    expect(byId.specialKatakana.kind === 'replay' && byId.specialKatakana.path).toBe(
      '/practice/special-katakana/special-katakana-fa-row',
    )
  })
})
