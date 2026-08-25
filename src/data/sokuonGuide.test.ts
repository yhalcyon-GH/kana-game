import { describe, expect, it } from 'vitest'
import { SOKUON_GUIDE } from './sokuonGuide'
import { DEFAULT_SOKUON_GUIDE_LOCALE, SOKUON_GUIDE_CONTENT } from './sokuonGuideContent'

describe('Sokuon Guide data (Issue #44)', () => {
  it('targets only the first Sokuon row and keeps content data-driven', () => {
    expect(SOKUON_GUIDE).toEqual({
      target: { categoryId: 'sokuon', rowId: 'sokuon-row' },
      slideAsset: 'guide/slide-sokuon.webp',
    })

    expect(SOKUON_GUIDE_CONTENT[DEFAULT_SOKUON_GUIDE_LOCALE]).toEqual({
      lang: 'en-US',
      subtitle: 'A small tsu means a short pause before the next sound. For example おと、おっと。バグ、バッグ。',
      audioKey: 'guide/sokuon-guide',
      dismissLabel: 'Got it!',
    })
  })
})
