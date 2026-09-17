// Tamamizu Guide (Issue #29/#31) — step STRUCTURE only (stable ids + which
// slide asset each step uses). Locale-specific text/audio/button labels
// live separately in introGuideContent.ts, so swapping images/audio/copy —
// or adding a new locale later — never touches this file or the IntroGuide
// component, only the content map.
//
// Every step is slide-only: Tamamizu is drawn INTO each slide's artwork
// itself (see design/images/guide/), so there's no separate mascot asset/
// image slot here any more (see Issue #31 — this replaced an earlier
// design that rendered a standalone Tamamizu image alongside/instead of a
// slide).
export type IntroGuideStepId =
  | 'intro.welcome'
  | 'intro.beforeUse'
  | 'intro.writingSystems'
  | 'intro.kanaSounds'
  | 'intro.kanaUsage'
  | 'intro.kanjiMeaning'
  | 'intro.startHiragana'

export type IntroGuideStep = {
  id: IntroGuideStepId
  // Path under public/, e.g. 'guide/slide-writing-systems.webp'.
  slideAsset: string
}

export const INTRO_GUIDE_STEPS: IntroGuideStep[] = [
  { id: 'intro.welcome', slideAsset: 'guide/slide-welcome.webp' },
  // Human-approved "Before using Tamamizu" slide (pricing/AI-content/usage-
  // data disclosure as one image + narrated audio) — inserted right after
  // the welcome slide and before the writing-systems explainer, so every
  // path through the guide (first launch or "View introduction again")
  // passes through it. Uses the exact same step machinery (audio
  // autoplay-attempt/replay/stop-on-advance) as every other step; only
  // IntroGuide.tsx's render treats this one id specially, to always show an
  // explicit Play/Replay control for its longer human narration instead of
  // only on autoplay failure. See introGuideContent.ts for its caption text.
  { id: 'intro.beforeUse', slideAsset: 'guide/slide-before-use.webp' },
  { id: 'intro.writingSystems', slideAsset: 'guide/slide-writing-systems.webp' },
  { id: 'intro.kanaSounds', slideAsset: 'guide/slide-kana-sounds.webp' },
  { id: 'intro.kanaUsage', slideAsset: 'guide/slide-kana-usage.webp' },
  { id: 'intro.kanjiMeaning', slideAsset: 'guide/slide-kanji-meaning.webp' },
  { id: 'intro.startHiragana', slideAsset: 'guide/slide-start-hiragana.webp' },
]
