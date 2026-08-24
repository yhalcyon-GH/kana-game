export type PracticeGuideLocaleContent = {
  lang: string
  speechText: string
  audioKey: string
  dismissLabel: string
}

const EN: PracticeGuideLocaleContent = {
  lang: 'en-US',
  speechText: 'Now, let’s practice! The star shows what to try next, but you can choose any practice you like. Kana Typing is optional.',
  audioKey: 'guide/practice-guide',
  dismissLabel: 'Got it!',
}

export const PRACTICE_GUIDE_CONTENT: Record<string, PracticeGuideLocaleContent> = { en: EN }
export const DEFAULT_PRACTICE_GUIDE_LOCALE = 'en'
