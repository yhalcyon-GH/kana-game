import { describe, expect, it } from 'vitest'
import { REVIEW_GUIDE } from './reviewGuide'
import { DEFAULT_REVIEW_GUIDE_LOCALE, REVIEW_GUIDE_CONTENT } from './reviewGuideContent'

describe('Review Guide data (Issue #40)', () => {
  it('keeps asset metadata separate from locale-specific content', () => {
    expect(REVIEW_GUIDE).toEqual({ imageAsset: 'guide/review-guide.webp' })
    expect(REVIEW_GUIDE_CONTENT[DEFAULT_REVIEW_GUIDE_LOCALE]).toEqual({
      lang: 'en-US',
      speechText: 'Kana and words you miss go to Review. You can practice them again anytime!',
      audioKey: 'guide/review-guide',
      dismissLabel: 'Got it!',
    })
  })
})
