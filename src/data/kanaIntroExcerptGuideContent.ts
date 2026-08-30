// Locale-specific UI copy for the Hiragana/Katakana section's Guide-excerpt
// replay button and its own Next/close controls — kept separate from
// introGuideContent.ts since this is new UI text of its own (the two
// replayed steps' subtitle/audio come from introGuideContent.ts unchanged;
// nothing here duplicates that copy).
export type KanaIntroExcerptGuideLocaleContent = {
  buttonLabel: string
  nextLabel: string
  doneLabel: string
  closeLabel: string
}

const EN: KanaIntroExcerptGuideLocaleContent = {
  buttonLabel: 'Hiragana & Katakana Guide',
  nextLabel: 'Next',
  doneLabel: 'Got it!',
  closeLabel: 'Close',
}

export const KANA_INTRO_EXCERPT_GUIDE_CONTENT: Record<string, KanaIntroExcerptGuideLocaleContent> = { en: EN }

export const DEFAULT_KANA_INTRO_EXCERPT_GUIDE_LOCALE = 'en'
