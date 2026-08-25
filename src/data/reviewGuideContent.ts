export type ReviewGuideLocaleContent = {
  lang: string
  speechText: string
  audioKey: string
  dismissLabel: string
}

const EN: ReviewGuideLocaleContent = {
  lang: 'en-US',
  speechText: 'Kana and words you miss go to Review. You can practice them again anytime!',
  audioKey: 'guide/review-guide',
  dismissLabel: 'Got it!',
}

export const REVIEW_GUIDE_CONTENT: Record<string, ReviewGuideLocaleContent> = { en: EN }
export const DEFAULT_REVIEW_GUIDE_LOCALE = 'en'
