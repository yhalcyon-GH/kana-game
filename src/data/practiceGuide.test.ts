import { describe, expect, it } from 'vitest'
import { PRACTICE_GUIDE } from './practiceGuide'
import { DEFAULT_PRACTICE_GUIDE_LOCALE, PRACTICE_GUIDE_CONTENT } from './practiceGuideContent'

describe('Practice Guide data (Issue #35)', () => {
  it('keeps target and asset structure separate from locale-specific content', () => {
    expect(PRACTICE_GUIDE).toEqual({
      target: { categoryId: 'hiragana', rowId: 'a-row' },
      imageAsset: 'guide/practice-guide.webp',
    })

    expect(PRACTICE_GUIDE_CONTENT[DEFAULT_PRACTICE_GUIDE_LOCALE]).toEqual({
      lang: 'en-US',
      speechText: 'Now, let’s practice! The star shows what to try next, but you can choose any practice you like. Kana Typing is optional.',
      audioKey: 'guide/practice-guide',
      dismissLabel: 'Got it!',
    })
  })
})
