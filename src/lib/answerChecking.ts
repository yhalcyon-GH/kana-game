import type { AnchorWord } from '../data/types'

// NFC normalization matters here: dakuten/handakuten kana can arrive either
// precomposed (が = U+304C) or as base + combining mark (か + U+3099) —
// different IMEs/keyboards (notably some Android flick layouts) aren't
// consistent about which form they emit, and the two look identical but
// compare unequal without normalizing first.
export function normalizeKana(text: string): string {
  return text.trim().normalize('NFC')
}

// Hiragana (U+3041-3096) and katakana (U+30A1-30F6) are laid out in
// Unicode with the same relative order, exactly 0x60 apart — shifting every
// character in range by that offset converts script wholesale. Characters
// outside the range (ー, ・, spaces, ...) pass through unchanged. Exported
// for src/lib/voiceQuality.ts's ASR reading normalization.
function shiftKanaScript(text: string, from: [number, number], offset: number): string {
  return [...text]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code >= from[0] && code <= from[1] ? String.fromCodePoint(code + offset) : ch
    })
    .join('')
}
export const toHiragana = (text: string) => shiftKanaScript(text, [0x30a1, 0x30f6], -0x60)

// Kana Typing (see KanaTypingPage) judges the FINAL TEXT left in the input
// field, not which physical keys or input method produced it — flick input,
// a JP romaji keyboard, a desktop IME, hardware kana input, etc. are all
// equally valid as long as the field ends up holding the word's exact
// printed kana. Raw Latin romaji is never accepted (the whole point of this
// exercise is producing kana, not transliterating it), and script matters:
// a katakana word requires katakana, not its hiragana reading, since script
// recognition/production is part of what this exercise tests.
export function isAnswerCorrect(input: string, word: Pick<AnchorWord, 'kana'>): boolean {
  return normalizeKana(input) === normalizeKana(word.kana)
}
