// Tamamizu Guide for the first Yōon lesson (Issue #50) — step STRUCTURE
// only. Every step reuses the single completed slide artwork (it already
// covers ①-④ + Tamamizu in one image; there's no separate per-step asset),
// so this only tracks which locale content each step maps to. Copy/audio
// live separately in youonGuideContent.ts, exactly like every other Guide.
export type YouonGuideStepId = 'youon.intro' | 'youon.one' | 'youon.two' | 'youon.three' | 'youon.four' | 'youon.katakana'

export const YOUON_GUIDE_STEPS: YouonGuideStepId[] = [
  'youon.intro',
  'youon.one',
  'youon.two',
  'youon.three',
  'youon.four',
  'youon.katakana',
]

export const YOUON_GUIDE = {
  target: { categoryId: 'youon', rowId: 'youon-ka-row' },
  slideAsset: 'guide/slide-youon.webp',
} as const
