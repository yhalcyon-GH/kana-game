import type { ChouonGuideStepId } from './chouonGuide'

// Locale content for the Chōon Guide. Subtitle and narration are always the
// same string per step/locale (the caption exactly matches what's spoken).
// Every string below is the confirmed exact script — do not paraphrase.
// Japanese kana is kept as real Unicode kana throughout (never romanized),
// including inside the ElevenLabs generation text (see
// scripts/generateChouonGuideAudioElevenLabs.ts), so it's spoken as actual
// Japanese rather than sounded out letter-by-letter.
export type ChouonGuideLocaleContent = {
  lang: string
  steps: Record<ChouonGuideStepId, { subtitle: string; audioKey: string }>
  nextLabel: string
  skipLabel: string
  finalLabel: string
}

const EN: ChouonGuideLocaleContent = {
  lang: 'en-US',
  steps: {
    'chouon.intro': {
      subtitle:
        'Now let’s learn about long vowels. A long vowel is a vowel sound held for an extra beat. In hiragana, write the extra sound with あ, い, う, え, or お. Don’t use the long vowel mark ー. In katakana, use the long vowel mark ー. For example, ラーメン.',
      audioKey: 'guide/chouon-1',
    },
    'chouon.a': {
      subtitle: 'For a long あ sound in hiragana, add あ. For example, おかあさん and おばあさん. Hold the あ sound a little longer.',
      audioKey: 'guide/chouon-2',
    },
    'chouon.i': {
      subtitle: 'For a long い sound in hiragana, add い. For example, おにいさん and おじいさん. Hold the い sound a little longer.',
      audioKey: 'guide/chouon-3',
    },
    'chouon.u': {
      subtitle: 'For a long う sound in hiragana, add う. For example, ゆうき and くうき. Hold the う sound a little longer.',
      audioKey: 'guide/chouon-4',
    },
    'chouon.e': {
      subtitle: 'For a long え sound in hiragana, usually add い. For example, えいが and ゆうめい. But おねえさん uses え instead.',
      audioKey: 'guide/chouon-5',
    },
    'chouon.o': {
      subtitle:
        'For a long お sound in hiragana, usually add う. For example, おはよう and いもうと. But some words use お instead, like とおい and こおり.',
      audioKey: 'guide/chouon-6',
    },
    'chouon.quiz': {
      subtitle: 'Now, let’s try a quick quiz. Fill in each blank with あ, い, う, え, お, or ー. Try all eight.',
      audioKey: 'guide/chouon-7',
    },
    'chouon.answers': {
      subtitle: 'Let’s check the answers. One, おかあさん. Two, おにいさん. Three, ゆうき. Four, えいが. Five, おねえさん. Six, おはよう. Seven, とおい. Eight, ラーメン.',
      audioKey: 'guide/chouon-8',
    },
  },
  nextLabel: 'Next',
  skipLabel: 'Skip',
  finalLabel: 'Got it!',
}

export const CHOUON_GUIDE_CONTENT: Record<string, ChouonGuideLocaleContent> = { en: EN }
export const DEFAULT_CHOUON_GUIDE_LOCALE = 'en'
