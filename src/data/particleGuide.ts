// Tamamizu Guide for particles (は/へ/を pronunciation quirks) — step
// STRUCTURE only (stable ids + which slide asset each step uses), exactly
// like introGuide.ts's shape. Unlike Sokuon/Chōon/Yōon/Special Katakana
// (which reuse ONE slide across every step), each step here has its OWN
// finished, externally-provided slide image — never regenerated/cropped/
// recolored by this app. Locale-specific text/audio/button labels live
// separately in particleGuideContent.ts, exactly like every other Guide.
//
// This Guide has no dedicated curriculum row/category to auto-trigger from
// (particles aren't a curriculum category — see CLAUDE.md's current
// category list) — it's only ever opened manually via the "Ask Tamamizu
// about particles" button on the Hiragana page (see CategoryRowsPage.tsx),
// so there is no `target` field the way Sokuon/Chōon/Yōon/Special Katakana
// have one.
export type ParticleGuideStepId = 'particle.intro' | 'particle.haHeWo' | 'particle.greetings'

export const PARTICLE_GUIDE_STEPS: { id: ParticleGuideStepId; slideAsset: string }[] = [
  { id: 'particle.intro', slideAsset: 'guide/slide-particle-1.png' },
  { id: 'particle.haHeWo', slideAsset: 'guide/slide-particle-2.png' },
  { id: 'particle.greetings', slideAsset: 'guide/slide-particle-3.png' },
]
