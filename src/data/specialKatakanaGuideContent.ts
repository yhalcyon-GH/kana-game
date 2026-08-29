import type { SpecialKatakanaGuideStepId } from './specialKatakanaGuide'

// Locale content for the Special Katakana Guide. Subtitle and narration are
// always the same string per step/locale (the caption exactly matches what's
// spoken), same convention as every other Guide. Exact scripts as confirmed
// — do not paraphrase; in particular, step 'how' deliberately says "small
// ya, yu, and yo" rather than the term "yōon", and step 'common' doesn't
// re-read out the specific example sounds already shown on the slide image.
export type SpecialKatakanaGuideLocaleContent = {
  lang: string
  steps: Record<SpecialKatakanaGuideStepId, { subtitle: string; audioKey: string }>
  nextLabel: string
  skipLabel: string
  finalLabel: string
}

const EN: SpecialKatakanaGuideLocaleContent = {
  lang: 'en-US',
  steps: {
    'specialKatakana.intro': {
      subtitle:
        'Japanese borrowed many words with sounds it didn’t originally have. Special Katakana is used to write those sounds. That’s why these sounds are only used in Katakana.',
      audioKey: 'guide/special-katakana-intro',
    },
    'specialKatakana.how': {
      subtitle:
        'Just like small ya, yu, and yo, a small kana can combine with the kana before it to make one sound. Here, we use small vowel kana.',
      audioKey: 'guide/special-katakana-how',
    },
    'specialKatakana.common': {
      subtitle: 'There are many Special Katakana sounds. Here, we’ll learn some of the most common ones.',
      audioKey: 'guide/special-katakana-common',
    },
  },
  nextLabel: 'Next',
  skipLabel: 'Skip',
  finalLabel: 'Got it!',
}

export const SPECIAL_KATAKANA_GUIDE_CONTENT: Record<string, SpecialKatakanaGuideLocaleContent> = { en: EN }
export const DEFAULT_SPECIAL_KATAKANA_GUIDE_LOCALE = 'en'
