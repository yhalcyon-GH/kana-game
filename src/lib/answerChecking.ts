import type { AnchorWord } from '../data/types'

// Full-width Latin/digits/punctuation (U+FF01-FF5E) -> half-width, plus
// full-width space -> half-width space. Some Japanese mobile keyboards type
// romaji in full-width when left in their default kana-input mode (e.g.
// "Ｉｎｕ" instead of "Inu") — collapse that before comparing.
function toHalfWidth(text: string): string {
  return text.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ')
}

export function normalizeRomaji(text: string): string {
  return toHalfWidth(text).trim().toLowerCase().replace(/\s+/g, ' ')
}

// NFC normalization matters here: dakuten/handakuten kana can arrive either
// precomposed (が = U+304C) or as base + combining mark (か + U+3099) —
// different IMEs/keyboards (notably some Android flick layouts) aren't
// consistent about which form they emit, and the two look identical but
// compare unequal without normalizing first.
export function normalizeKana(text: string): string {
  return text.trim().normalize('NFC')
}

// A typed answer is correct if it matches the word's kana OR its romaji —
// the learner can answer either way.
export function isAnswerCorrect(input: string, word: Pick<AnchorWord, 'kana' | 'romaji'>): boolean {
  return normalizeKana(input) === normalizeKana(word.kana) || normalizeRomaji(input) === normalizeRomaji(word.romaji)
}
