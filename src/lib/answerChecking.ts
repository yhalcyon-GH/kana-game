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

// Hiragana (U+3041-3096) and katakana (U+30A1-30F6) are laid out in
// Unicode with the same relative order, exactly 0x60 apart — shifting every
// character in range by that offset converts script wholesale. Characters
// outside either range (ー, ・, spaces, ...) pass through unchanged, so
// applying the "wrong" direction to a word that's already in the target
// script is a harmless no-op rather than mangling it. toHiragana is
// exported for src/lib/voiceQuality.ts's ASR reading normalization too, in
// addition to its use in isAnswerCorrect below.
function shiftKanaScript(text: string, from: [number, number], offset: number): string {
  return [...text]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code >= from[0] && code <= from[1] ? String.fromCodePoint(code + offset) : ch
    })
    .join('')
}
const toKatakana = (text: string) => shiftKanaScript(text, [0x3041, 0x3096], 0x60)
export const toHiragana = (text: string) => shiftKanaScript(text, [0x30a1, 0x30f6], -0x60)

type RomajiSegment = {
  canonical: string
  id: string
  placeholder: boolean
}

// Align every character ID to the exact substring it contributes to the
// canonical word spelling. Context-dependent っ/ッ/ー IDs use '-' only as a
// catalog placeholder, so they must consume a real, non-empty substring here.
// Searching the small input exhaustively also lets us reject an ambiguous
// alignment rather than manufacturing alternate answers from a guess.
function alignCanonicalRomaji(tokens: string[], characterIds: string[]): RomajiSegment[][] | null {
  const matches: RomajiSegment[][][] = []
  const segments = tokens.map(() => [] as RomajiSegment[])

  function search(tokenIndex: number, consumedLength: number, characterIndex: number): void {
    if (matches.length > 1) return
    if (tokenIndex === tokens.length) {
      if (characterIndex === characterIds.length) matches.push(segments.map((tokenSegments) => [...tokenSegments]))
      return
    }

    const token = tokens[tokenIndex]
    if (consumedLength === token.length) {
      search(tokenIndex + 1, 0, characterIndex)
      return
    }
    if (characterIndex === characterIds.length) return

    const id = characterIds[characterIndex]
    const base = CHARACTERS_BY_ID[id]?.romaji
    if (!base) return

    if (base === '-') {
      for (let boundary = consumedLength + 1; boundary <= token.length; boundary++) {
        segments[tokenIndex].push({
          canonical: token.slice(consumedLength, boundary),
          id,
          placeholder: true,
        })
        search(tokenIndex, boundary, characterIndex + 1)
        segments[tokenIndex].pop()
      }
      return
    }

    if (!token.startsWith(base, consumedLength)) return
    segments[tokenIndex].push({ canonical: base, id, placeholder: false })
    search(tokenIndex, consumedLength + base.length, characterIndex + 1)
    segments[tokenIndex].pop()
  }

  search(0, 0, 0)
  return matches.length === 1 ? matches[0] : null
}

function expandTokenVariants(segments: RomajiSegment[]): string[] {
  const choices = segments.map((segment) =>
    segment.placeholder ? [segment.canonical] : [segment.canonical, ...(ROMAJI_ALTERNATES[segment.id] ?? [])],
  )

  const selectedVariants = choices.reduce<string[][]>(
    (combinations, options) => combinations.flatMap((combination) => options.map((option) => [...combination, option])),
    [[]],
  )

  return selectedVariants.map((selected) =>
    segments
      .map((segment, index) => {
        if (!segment.placeholder) return selected[index]

        const nextSegment = segments[index + 1]
        const nextVariant = selected[index + 1]
        const doublesNextCanonical =
          segment.canonical.length === 1 &&
          nextSegment !== undefined &&
          !nextSegment.placeholder &&
          segment.canonical === nextSegment.canonical[0]
        return doublesNextCanonical ? nextVariant[0] : segment.canonical
      })
      .join(''),
  )
}

// Alternate acceptable spellings of word.romaji, built by aligning
// characterIds with word.romaji's space-separated tokens (a word can romanize
// as multiple tokens, e.g. a particle phrase), then substituting each real
// character's Kunrei-shiki/other alternate spelling. Placeholder segments are
// never emitted as '-' or deleted.
function romajiVariants(word: Pick<AnchorWord, 'romaji' | 'characterIds'>): string[] {
  const tokens = word.romaji.split(' ')
  const alignedTokens = alignCanonicalRomaji(tokens, word.characterIds)
  if (!alignedTokens) return []

  const tokenVariantLists = alignedTokens.map(expandTokenVariants)
  return tokenVariantLists.reduce((acc, variants) => acc.flatMap((a) => variants.map((v) => (a ? `${a} ${v}` : v))), [
    '',
  ])
}

// A typed answer is correct if it matches the word's kana IN EITHER SCRIPT
// (a katakana word like サッカー also accepts さっかー, and vice versa — Kana
// Typing is testing whether the learner knows the sound and can type it in
// kana, not which script the word happens to be printed in), its canonical
// romaji, or a romaji variant using an alternate romanization system (see
// romajiVariants) — the learner can answer any of these ways.
export function isAnswerCorrect(
  input: string,
  word: Pick<AnchorWord, 'kana' | 'romaji'> & Partial<Pick<AnchorWord, 'characterIds'>>,
): boolean {
  const normInput = normalizeRomaji(input)
  const normInputKana = normalizeKana(input)
  const kanaMatches = [word.kana, toKatakana(word.kana), toHiragana(word.kana)].some(
    (variant) => normInputKana === normalizeKana(variant),
  )
  if (kanaMatches || normInput === normalizeRomaji(word.romaji)) return true
  if (!word.characterIds) return false
  return romajiVariants({ romaji: word.romaji, characterIds: word.characterIds }).some(
    (variant) => normInput === normalizeRomaji(variant),
  )
}
