export type LearnTracingGuideLocaleContent = {
  lang: string
  speechText: string
  audioKey: string
  dismissLabel: string
}

const EN: LearnTracingGuideLocaleContent = {
  lang: 'en-US',
  speechText: 'Learn with characters and sounds, or trace them too. Either is fine!',
  audioKey: 'guide/learn-tracing',
  dismissLabel: 'Got it!',
}

export const LEARN_TRACING_GUIDE_CONTENT: Record<string, LearnTracingGuideLocaleContent> = { en: EN }
export const DEFAULT_LEARN_TRACING_GUIDE_LOCALE = 'en'
