export type ReviewGuideLocaleContent = {
  lang: string
  speechText: string
  audioKey: string
  dismissLabel: string
}

const EN: ReviewGuideLocaleContent = {
  lang: 'en-US',
  speechText: 'Retry lets you practice this round’s mistakes. Review saves tricky kana and words for later.',
  audioKey: 'guide/review-guide',
  dismissLabel: 'Got it!',
}

export const REVIEW_GUIDE_CONTENT: Record<string, ReviewGuideLocaleContent> = { en: EN }
export const DEFAULT_REVIEW_GUIDE_LOCALE = 'en'
