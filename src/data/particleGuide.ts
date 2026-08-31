// Tamamizu Guide for particles (は/へ/を pronunciation quirks) — step
// STRUCTURE only (stable ids + which slide asset each step uses), exactly
// like introGuide.ts's shape. Unlike Sokuon/Chōon/Yōon/Special Katakana
// (which reuse ONE slide across every step), each step here has its OWN
// finished, externally-provided slide image — never regenerated/cropped/
// recolored by this app. Locale-specific text/audio/button labels live
// separately in particleGuideContent.ts, exactly like every other Guide.
//
// Particles aren't a curriculum category of their own (see CLAUDE.md's
// category list), so this Guide has no category to trigger from — but it
// does have a natural ROW: hiragana wa-row is where わ/を and the topic
// particle は land, and where the greetings こんにちは/こんばんは (Step 3's
// content) enter the vocabulary. `target` below is that row's Practice Hub,
// which auto-shows this Guide on the first visit exactly like every other
// concept Guide's target (see PracticeHubPage's showParticleGuide).
//
// The supplementary "Ask Tamamizu about particles" button on the Hiragana
// page (see CategoryRowsPage.tsx) is unchanged and independent: it's a
// manual `?guide=particle` replay that works at any time, before or after
// the automatic first showing, and never writes progress on replay.
export type ParticleGuideStepId = 'particle.intro' | 'particle.haHeWo' | 'particle.greetings'

export const PARTICLE_GUIDE_STEPS: { id: ParticleGuideStepId; slideAsset: string }[] = [
  { id: 'particle.intro', slideAsset: 'guide/slide-particle-1.png' },
  { id: 'particle.haHeWo', slideAsset: 'guide/slide-particle-2.png' },
  { id: 'particle.greetings', slideAsset: 'guide/slide-particle-3.png' },
]

export const PARTICLE_GUIDE = {
  target: { categoryId: 'hiragana', rowId: 'wa-row' },
  autoTargets: [
    { categoryId: 'hiragana', rowId: 'ha-row' },
    { categoryId: 'hiragana', rowId: 'wa-row' },
  ],
} as const
