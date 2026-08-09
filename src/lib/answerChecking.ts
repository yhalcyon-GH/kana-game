import { CHARACTERS_BY_ID, ROMAJI_ALTERNATES } from '../data/characters'
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

// Alternate acceptable spellings of word.romaji, built by walking
// characterIds in step with word.romaji's space-separated tokens (a word can
// romanize as multiple space-separated tokens, e.g. a particle phrase) and
// substituting each character's Kunrei-shiki/other alternate spelling (see
// ROMAJI_ALTERNATES) in place of its Hepburn-based canonical one. Only
// characters that actually have an alternate branch, so most words produce
// just their single canonical spelling back.
function romajiVariants(word: Pick<AnchorWord, 'romaji' | 'characterIds'>): string[] {
  const tokens = word.romaji.split(' ')
  let charIndex = 0
  const tokenVariantLists = tokens.map((token) => {
    let combos = ['']
    let consumedLength = 0
    while (consumedLength < token.length && charIndex < word.characterIds.length) {
      const id = word.characterIds[charIndex]
      const base = CHARACTERS_BY_ID[id]?.romaji ?? ''
      const options = [base, ...(ROMAJI_ALTERNATES[id] ?? [])]
      combos = combos.flatMap((c) => options.map((o) => c + o))
      consumedLength += base.length
      charIndex++
    }
    return combos
  })
  return tokenVariantLists.reduce((acc, variants) => acc.flatMap((a) => variants.map((v) => (a ? `${a} ${v}` : v))), [
    '',
  ])
}

// A typed answer is correct if it matches the word's kana, its canonical
// romaji, or a romaji variant using an alternate romanization system (see
// romajiVariants) — the learner can answer any of these ways.
export function isAnswerCorrect(
  input: string,
  word: Pick<AnchorWord, 'kana' | 'romaji'> & Partial<Pick<AnchorWord, 'characterIds'>>,
): boolean {
  const normInput = normalizeRomaji(input)
  if (normalizeKana(input) === normalizeKana(word.kana) || normInput === normalizeRomaji(word.romaji)) return true
  if (!word.characterIds) return false
  return romajiVariants({ romaji: word.romaji, characterIds: word.characterIds }).some(
    (variant) => normInput === normalizeRomaji(variant),
  )
}
