// Tamamizu Guide for the first Chōon lesson (Issue TBD) — step STRUCTURE
// only (stable ids + which slide asset each step uses). Locale-specific
// text/audio/button labels live separately in chouonGuideContent.ts, so
// swapping images/audio/copy never touches this file, exactly like every
// other Guide.
//
// Unlike Yōon (one shared slide covering every section), each Chōon step
// has its OWN completed slide image — 8 slides total, numbered 1/8-8/8 on
// the artwork itself: Intro, a/i/u/e/o sound, Quiz, Answers.
export type ChouonGuideStepId =
  | 'chouon.intro'
  | 'chouon.a'
  | 'chouon.i'
  | 'chouon.u'
  | 'chouon.e'
  | 'chouon.o'
  | 'chouon.quiz'
  | 'chouon.answers'

export type ChouonGuideStep = {
  id: ChouonGuideStepId
  // Path under public/, e.g. 'guide/slide-chouon-1.webp'.
  slideAsset: string
}

export const CHOUON_GUIDE_STEPS: ChouonGuideStep[] = [
  { id: 'chouon.intro', slideAsset: 'guide/slide-chouon-1.webp' },
  { id: 'chouon.a', slideAsset: 'guide/slide-chouon-2.webp' },
  { id: 'chouon.i', slideAsset: 'guide/slide-chouon-3.webp' },
  { id: 'chouon.u', slideAsset: 'guide/slide-chouon-4.webp' },
  { id: 'chouon.e', slideAsset: 'guide/slide-chouon-5.webp' },
  { id: 'chouon.o', slideAsset: 'guide/slide-chouon-6.webp' },
  { id: 'chouon.quiz', slideAsset: 'guide/slide-chouon-7.webp' },
  { id: 'chouon.answers', slideAsset: 'guide/slide-chouon-8.webp' },
]

export const CHOUON_GUIDE = {
  target: { categoryId: 'chouon', rowId: 'chouon-a-row' },
} as const
