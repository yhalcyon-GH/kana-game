// Static data for the "Ask Tamamizu" concept-help buttons (Hiragana,
// Katakana, Sokuon, Chōon, Yōon). Each entry's finished artwork already IS
// the full button UI, so this module only owns the Ask Tamamizu
// presentation data (image asset + accessible label) — see
// AskTamamizuButton. Guide replay targets remain owned by the existing
// Guide data/replay mechanism (SOKUON_GUIDE/CHOUON_GUIDE/YOUON_GUIDE etc.
// in CategoryRowsPage.tsx), not this module.
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
