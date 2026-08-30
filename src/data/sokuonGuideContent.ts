export type SokuonGuideLocaleContent = {
  lang: string
  subtitle: string
  audioKey: string
  dismissLabel: string
}

const EN: SokuonGuideLocaleContent = {
  lang: 'en-US',
  subtitle: 'A small tsu means a short pause before the next sound. For example おと、おっと。バグ、バッグ。',
  audioKey: 'guide/sokuon-guide',
  dismissLabel: 'Got it!',
}

export const SOKUON_GUIDE_CONTENT: Record<string, SokuonGuideLocaleContent> = { en: EN }
export const DEFAULT_SOKUON_GUIDE_LOCALE = 'en'
