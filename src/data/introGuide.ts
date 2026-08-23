// Tamamizu Guide Phase 1 (Issue #29) — step STRUCTURE only (stable ids +
// which visual asset slot each step uses). Locale-specific text/audio/
// button labels live separately in introGuideContent.ts, so swapping
// images/audio/copy — or adding a new locale later — never touches this
// file or the IntroGuide component, only the content map.
export type IntroGuideStepId =
  | 'intro.welcome'
  | 'intro.writingSystems'
  | 'intro.kanaSounds'
  | 'intro.kanjiMeaning'
  | 'intro.startHiragana'

export type IntroGuideStep = {
  id: IntroGuideStepId
  // Path under public/ (see AssetImage-style usage in IntroGuide.tsx),
  // e.g. 'guide/slide-writing-systems.webp'. Omit for a step that shows
  // only Tamamizu (see mascotAsset).
  slideAsset?: string
  // Path under public/ for Tamamizu's pose on this step — every step shows
  // Tamamizu (she's the narrator throughout), this just picks which art.
  mascotAsset: string
}

// Guide-specific pose (sitting, from design/images/tamamizu/tamamizu-
// sitting.png) — distinct from components/Mascot.tsx's answer-feedback mood
// crops (public/mascot/*.webp), which this component never reads, so a new
// pose here never touches that type/mapping.
const TAMAMIZU_GUIDE = 'guide/tamamizu-sitting.webp'

export const INTRO_GUIDE_STEPS: IntroGuideStep[] = [
  { id: 'intro.welcome', mascotAsset: TAMAMIZU_GUIDE },
  { id: 'intro.writingSystems', slideAsset: 'guide/slide-writing-systems.webp', mascotAsset: TAMAMIZU_GUIDE },
  { id: 'intro.kanaSounds', slideAsset: 'guide/slide-kana-sounds.webp', mascotAsset: TAMAMIZU_GUIDE },
  { id: 'intro.kanjiMeaning', slideAsset: 'guide/slide-kanji-meaning.webp', mascotAsset: TAMAMIZU_GUIDE },
  { id: 'intro.startHiragana', mascotAsset: TAMAMIZU_GUIDE },
]
