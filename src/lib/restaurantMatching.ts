import type { RestaurantDish } from '../data/restaurantDishes'

// Pure, DOM-free text normalization + matching for the Restaurant game's
// voice/romaji order checking. Kept independent of SpeechRecognition/React
// so it's directly unit-testable — see restaurantMatching.test.ts.

const PUNCTUATION_RE =
  // Japanese + ASCII punctuation/whitespace commonly produced by speech
  // recognition transcripts (、。！？「」『』・, plus ASCII , . ! ? and
  // whitespace of any kind).
  /[\s、。！？「」『』・,.!?～〜]/g

// Normalizes a transcript or alias so both can be compared on equal footing:
// Unicode NFKC (folds full/half-width variants, combines diacritics),
// strips whitespace/punctuation, and converts katakana to hiragana so
// either script matches the same word (a SpeechRecognition transcript may
// come back in either).
export function normalizeJapanese(text: string): string {
  const nfkc = text.normalize('NFKC')
  const stripped = nfkc.replace(PUNCTUATION_RE, '')
  // Katakana (U+30A1–U+30F6) -> Hiragana (U+3041–U+3096): shift down by the
  // fixed 0x60 offset shared by the two blocks.
  return stripped.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
}

const SUMISEN_FORMS = ['すみません', 'すいません'].map(normalizeJapanese)
const ORDER_INTENT_FORMS = ['おねがいします', 'お願いします', 'ください', '下さい'].map(normalizeJapanese)

// True if the normalized transcript contains a recognized "please give me
// X" phrase. すみません/すいません is deliberately NOT checked here — it's
// optional per the spec, order-intent is carried entirely by
// お願いします/ください forms.
export function hasOrderIntent(normalizedTranscript: string): boolean {
  return ORDER_INTENT_FORMS.some((form) => normalizedTranscript.includes(form))
}

// Present for symmetry/documentation and reuse by callers that want to
// special-case greeting the transcript; not required for success.
export function hasSumimasen(normalizedTranscript: string): boolean {
  return SUMISEN_FORMS.some((form) => normalizedTranscript.includes(form))
}

// Identifies which of the given (displayed) dishes, if any, is named in the
// normalized transcript. Aliases are checked longest-normalized-form-first
// across ALL candidate dishes so a short alias that happens to be a
// substring of a different dish's alias can't shadow the real, longer match
// (e.g. avoids a short alias of one dish falsely matching before a longer,
// more specific alias of another).
export function identifyDish(normalizedTranscript: string, candidates: RestaurantDish[]): RestaurantDish | null {
  const aliasEntries: { normalized: string; dish: RestaurantDish }[] = []
  for (const dish of candidates) {
    for (const alias of dish.recognitionAliases) {
      aliasEntries.push({ normalized: normalizeJapanese(alias), dish })
    }
  }
  aliasEntries.sort((a, b) => b.normalized.length - a.normalized.length)
  for (const entry of aliasEntries) {
    if (entry.normalized.length > 0 && normalizedTranscript.includes(entry.normalized)) {
      return entry.dish
    }
  }
  return null
}

export type OrderCheckResult =
  | { outcome: 'success' }
  | { outcome: 'wrong-dish'; identified: RestaurantDish }
  | { outcome: 'unrecognized' }

// Full order-checking pipeline for one transcript against one round: is a
// dish named among the displayed menu, does the transcript carry order
// intent, and does the named dish match the target? Kept as one function so
// both the SpeechRecognition path (checked per-alternative) and any future
// caller share identical success criteria.
export function checkOrder(rawTranscript: string, menu: RestaurantDish[], target: RestaurantDish): OrderCheckResult {
  const normalized = normalizeJapanese(rawTranscript)
  const identified = identifyDish(normalized, menu)
  if (!identified) return { outcome: 'unrecognized' }
  if (identified.id !== target.id) return { outcome: 'wrong-dish', identified }
  return { outcome: 'success' }
}

// Checks up to 3 SpeechRecognition alternatives; succeeds if ANY one of
// them is a valid order for the target. Mirrors the spec's "check up to 3
// alternatives" requirement without the caller needing to loop itself.
export function checkOrderAlternatives(
  rawAlternatives: string[],
  menu: RestaurantDish[],
  target: RestaurantDish,
): OrderCheckResult {
  let wrongDish: OrderCheckResult | null = null
  for (let i = 0; i < Math.min(3, rawAlternatives.length); i++) {
    const result = checkOrder(rawAlternatives[i], menu, target)
    if (result.outcome === 'success') return result
    if (result.outcome === 'wrong-dish') wrongDish = result
  }
  return wrongDish ?? { outcome: 'unrecognized' }
}
