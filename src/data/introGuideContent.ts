import type { IntroGuideStepId } from './introGuide'

// Locale-specific text/audio/button-label content for the Tamamizu Guide,
// kept fully separate from introGuide.ts's step STRUCTURE (ids + which
// asset slot each step uses) — adding a new locale means adding one more
// entry to INTRO_GUIDE_CONTENT below, never touching the step list or the
// IntroGuide component. Subtitle and narration audio are deliberately tied
// together per step/locale (the caption always matches what's spoken).
export type IntroGuideLocaleContent = {
  // BCP-47 tag for the Web Speech fallback (see hooks/useTTS.ts's `lang`
  // param) — used only when a step's audioKey below has no pre-generated
  // clip yet.
  lang: string
  steps: Record<IntroGuideStepId, { subtitle: string; audioKey: string }>
  nextLabel: string
  skipLabel: string
  finalLabel: string
}

const EN: IntroGuideLocaleContent = {
  lang: 'en-US',
  steps: {
    'intro.welcome': {
      subtitle: "Hi! I'm Tamamizu. Let's learn Japanese together!",
      audioKey: 'guide/intro-welcome',
    },
    'intro.writingSystems': {
      subtitle: 'Japanese has three main writing systems: Hiragana, Katakana, and Kanji.',
      audioKey: 'guide/intro-writing-systems',
    },
    'intro.kanaSounds': {
      subtitle: 'Hiragana and Katakana represent sounds. Both of these represent the sound "a."',
      audioKey: 'guide/intro-kana-sounds',
    },
    'intro.kanaUsage': {
      subtitle: 'Hiragana is mainly used for Japanese words and grammar. Katakana is mainly used for foreign words.',
      audioKey: 'guide/intro-kana-usage',
    },
    'intro.kanjiMeaning': {
      subtitle: 'Kanji also carry meaning. The top kanji means "mountain," and the bottom one means "tree."',
      audioKey: 'guide/intro-kanji-meaning',
    },
    'intro.startHiragana': {
      subtitle: "In this app, you'll learn Hiragana and Katakana.\nLet's start with Hiragana!",
      audioKey: 'guide/intro-start-hiragana',
    },
  },
  nextLabel: 'Next',
  skipLabel: 'Skip',
  finalLabel: "Let's go!",
}

export const INTRO_GUIDE_CONTENT: Record<string, IntroGuideLocaleContent> = { en: EN }

// No locale-selection UI exists yet anywhere in the app (out of scope for
// this issue — see its "no unrelated i18n refactor" note); this is just
// where that choice would plug in once one does.
export const DEFAULT_INTRO_GUIDE_LOCALE = 'en'
