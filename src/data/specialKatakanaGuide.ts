// Tamamizu Guide for Special Katakana's first session (see
// curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID) — step STRUCTURE only.
// Every step reuses the SAME single supplied slide image (a finished,
// externally-provided asset — never regenerated/cropped/recolored by this
// app), so this only tracks which locale content each step maps to. Copy/
// audio live separately in specialKatakanaGuideContent.ts, exactly like
// every other Guide (see youonGuide.ts's identical shape).
export type SpecialKatakanaGuideStepId = 'specialKatakana.intro' | 'specialKatakana.how' | 'specialKatakana.common'

export const SPECIAL_KATAKANA_GUIDE_STEPS: SpecialKatakanaGuideStepId[] = [
  'specialKatakana.intro',
  'specialKatakana.how',
  'specialKatakana.common',
]

export const SPECIAL_KATAKANA_GUIDE = {
  // Special Katakana's first session — this is the ONE row that triggers
  // this Guide's first-time auto-display (see PracticeHubPage's
  // showSpecialKatakanaGuide), not the shared /youon page itself.
  target: { categoryId: 'special-katakana', rowId: 'special-katakana-fa-row' },
  slideAsset: 'guide/slide-special-katakana.png',
} as const
