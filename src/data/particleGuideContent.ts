import type { ParticleGuideStepId } from './particleGuide'

// Locale content for the Particle Guide. Subtitle and narration are always
// the same string per step/locale (the caption exactly matches what's
// spoken), same convention as every other Guide. These 3 scripts are
// EXACT, confirmed narration for real recorded clips — do not paraphrase
// or alter a single character.
export type ParticleGuideLocaleContent = {
  lang: string
  steps: Record<ParticleGuideStepId, { subtitle: string; audioKey: string }>
  nextLabel: string
  skipLabel: string
  finalLabel: string
}

const EN: ParticleGuideLocaleContent = {
  lang: 'en-US',
  steps: {
    'particle.intro': {
      subtitle: 'Particles are like glue. They connect words. Japanese needs particles.',
      audioKey: 'guide/particle-1',
    },
    'particle.haHeWo': {
      subtitle:
        'Some particles sound different from normal kana. As a particle, は is read wa, and へ is read e. Also, write を for this particle, not お.',
      audioKey: 'guide/particle-2',
    },
    'particle.greetings': {
      subtitle:
        'In こんにちは and こんばんは, the last sound is wa. But we write は, not わ. That is because this は was originally a particle.',
      audioKey: 'guide/particle-3',
    },
  },
  nextLabel: 'Next',
  skipLabel: 'Skip',
  finalLabel: 'Got it!',
}

export const PARTICLE_GUIDE_CONTENT: Record<string, ParticleGuideLocaleContent> = { en: EN }
export const DEFAULT_PARTICLE_GUIDE_LOCALE = 'en'
