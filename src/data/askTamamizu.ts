// Static data for the "Ask Tamamizu" concept-help buttons (Hiragana,
// Katakana, Sokuon, Chōon, Yōon). Each entry's finished artwork already IS
// the full button UI, so this module only tracks the asset path + the
// accessible name a screen reader needs (see AskTamamizuButton). Guide
// replay ids/paths are pulled from CONCEPT_GUIDE_CATALOG (Sokuon/Chōon/
// Yōon) rather than hardcoded, so this stays a thin presentation-data layer
// on top of the existing Guide catalog/replay mechanism.
export const ASK_TAMAMIZU_HIRAGANA = {
  imageAsset: 'guide/ask-tamamizu-hiragana.webp',
  ariaLabel: 'Ask Tamamizu about Hiragana',
} as const

export const ASK_TAMAMIZU_KATAKANA = {
  imageAsset: 'guide/ask-tamamizu-katakana.webp',
  ariaLabel: 'Ask Tamamizu about Katakana',
} as const

export const ASK_TAMAMIZU_SOKUON = {
  imageAsset: 'guide/ask-tamamizu-small-tsu.webp',
  ariaLabel: 'Ask Tamamizu about small tsu',
} as const

export const ASK_TAMAMIZU_CHOUON = {
  imageAsset: 'guide/ask-tamamizu-long-vowels.webp',
  ariaLabel: 'Ask Tamamizu about long vowels',
} as const

export const ASK_TAMAMIZU_YOUON = {
  imageAsset: 'guide/ask-tamamizu-small-youon.webp',
  ariaLabel: 'Ask Tamamizu about small ya yu yo sounds',
} as const
