import { describe, expect, it } from 'vitest'
import { INTRO_GUIDE_STEPS } from './introGuide'
import { KANA_INTRO_EXCERPT_STEP_IDS } from './kanaIntroExcerptGuide'

// Issue #46: the Hiragana/Katakana section replay button is an excerpt of
// the six-step Introduction (PR #43), not a new standalone Guide.
describe('KANA_INTRO_EXCERPT_STEP_IDS (Issue #46)', () => {
  it('replays exactly the kana-sounds then kana-usage steps, in order', () => {
    expect(KANA_INTRO_EXCERPT_STEP_IDS).toEqual(['intro.kanaSounds', 'intro.kanaUsage'])
  })

  it('every excerpted step id is a real Introduction step', () => {
    const realStepIds = new Set(INTRO_GUIDE_STEPS.map((s) => s.id))
    for (const id of KANA_INTRO_EXCERPT_STEP_IDS) {
      expect(realStepIds.has(id)).toBe(true)
    }
  })
})
