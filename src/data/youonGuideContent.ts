import type { YouonGuideStepId } from './youonGuide'

// Locale content for the Yōon Guide. Subtitle and narration are always the
// same string per step/locale (the caption exactly matches what's spoken) —
// this is what lets the spoken "One."/"Two."/"Three."/"Four." line up with
// the ①②③④ numbered boxes drawn into the shared slide image. Katakana has
// no numbered box on the slide, so its step deliberately doesn't start with
// a number either.
export type YouonGuideLocaleContent = {
  lang: string
  steps: Record<YouonGuideStepId, { subtitle: string; audioKey: string }>
  nextLabel: string
  skipLabel: string
  finalLabel: string
}

const EN: YouonGuideLocaleContent = {
  lang: 'en-US',
  steps: {
    'youon.intro': {
      subtitle: 'Now I’ll explain small ya, yu, and yo.',
      audioKey: 'guide/youon-intro',
    },
    'youon.one': {
      subtitle: 'One. Put the kana together to make one sound. き plus small ゃ becomes きゃ.',
      audioKey: 'guide/youon-one',
    },
    'youon.two': {
      subtitle: 'Two. The first kana comes from the i-row. き, し, ち, に, ひ, み, り...',
      audioKey: 'guide/youon-two',
    },
    'youon.three': {
      subtitle: 'Three. The second kana is a small ゃ, ゅ, or ょ.',
      audioKey: 'guide/youon-three',
    },
    'youon.four': {
      subtitle: 'Four. に plus small ゅ becomes にゅ. り plus small ょ becomes りょ.',
      audioKey: 'guide/youon-four',
    },
    'youon.katakana': {
      subtitle: 'Katakana is the same, too. You use small ャ, ュ, ョ in the same way in katakana.',
      audioKey: 'guide/youon-katakana',
    },
  },
  nextLabel: 'Next',
  skipLabel: 'Skip',
  finalLabel: 'Got it!',
}

export const YOUON_GUIDE_CONTENT: Record<string, YouonGuideLocaleContent> = { en: EN }
export const DEFAULT_YOUON_GUIDE_LOCALE = 'en'
