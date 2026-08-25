import { describe, expect, it } from 'vitest'
import { INTRO_GUIDE_STEPS } from './introGuide'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from './introGuideContent'

// Issue #31: every step is slide-only now (Tamamizu is drawn into each
// slide's own artwork) — no separate mascot asset field exists any more.
describe('INTRO_GUIDE_STEPS (Issue #31)', () => {
  it('every step has its own slideAsset, and no step defines a mascot field', () => {
    for (const step of INTRO_GUIDE_STEPS) {
      expect(step.slideAsset).toBeTruthy()
      expect('mascotAsset' in step).toBe(false)
    }
  })

  it('has exactly the 6 expected steps, in order', () => {
    expect(INTRO_GUIDE_STEPS.map((s) => s.id)).toEqual([
      'intro.welcome',
      'intro.writingSystems',
      'intro.kanaSounds',
      'intro.kanaUsage',
      'intro.kanjiMeaning',
      'intro.startHiragana',
    ])
  })

  it('keeps the kana-usage subtitle and narration key together', () => {
    const content = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE].steps['intro.kanaUsage']
    expect(content).toEqual({
      subtitle: 'Hiragana is mainly used for Japanese words and grammar. Katakana is mainly used for foreign words.',
      audioKey: 'guide/intro-kana-usage',
    })
  })

  it('every step has locale content (subtitle + audioKey) for the default locale', () => {
    const locale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]
    for (const step of INTRO_GUIDE_STEPS) {
      expect(locale.steps[step.id].subtitle).toBeTruthy()
      expect(locale.steps[step.id].audioKey).toBeTruthy()
    }
  })
})
