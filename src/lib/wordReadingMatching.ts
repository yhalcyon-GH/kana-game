import type { AnchorWord } from '../data/types'
import { normalizeJapanese } from './restaurantMatching'

// Pure, DOM-free speech-transcript matching for the Word Reading assessment
// question (Issue #189) — the Word Reading analogue of
// restaurantMatching.ts's identifyDish/checkOrder(Alternatives), reusing its
// normalizeJapanese exactly (same NFKC + punctuation-strip + katakana->
// hiragana folding a SpeechRecognition transcript needs). Kept as its own
// module rather than extending restaurantMatching.ts: AnchorWord has no
// curated `recognitionAliases` list like RestaurantDish does (see
// restaurantDishes.ts) — a vocabulary word's own `kana` is its only reading,
// so it's used directly as the (single) alias.

// Identifies which of `candidates` (if any) is named in the normalized
// transcript — longest-kana-first, same anti-shadowing rule as
// identifyDish, so a short word's kana can't falsely match before a longer
// candidate that's actually a substring match.
export function identifyWordReading(normalizedTranscript: string, candidates: readonly AnchorWord[]): AnchorWord | null {
  const entries = candidates
    .map((word) => ({ normalized: normalizeJapanese(word.kana), word }))
    .filter((entry) => entry.normalized.length > 0)
  entries.sort((a, b) => b.normalized.length - a.normalized.length)
  for (const entry of entries) {
    if (normalizedTranscript.includes(entry.normalized)) return entry.word
  }
  return null
}

export type WordReadingCheckResult =
  | { outcome: 'success' }
  | { outcome: 'wrong-word'; identified: AnchorWord }
  | { outcome: 'unrecognized' }

export function checkWordReading(rawTranscript: string, candidates: readonly AnchorWord[], target: AnchorWord): WordReadingCheckResult {
  const normalized = normalizeJapanese(rawTranscript)
  const identified = identifyWordReading(normalized, candidates)
  if (!identified) return { outcome: 'unrecognized' }
  if (identified.id !== target.id) return { outcome: 'wrong-word', identified }
  return { outcome: 'success' }
}

// Checks up to 3 SpeechRecognition alternatives, same "any one of them
// succeeding is enough" rule as restaurantMatching.ts's
// checkOrderAlternatives.
export function checkWordReadingAlternatives(
  rawAlternatives: readonly string[],
  candidates: readonly AnchorWord[],
  target: AnchorWord,
): WordReadingCheckResult {
  let wrong: WordReadingCheckResult | null = null
  for (let i = 0; i < Math.min(3, rawAlternatives.length); i++) {
    const result = checkWordReading(rawAlternatives[i], candidates, target)
    if (result.outcome === 'success') return result
    if (result.outcome === 'wrong-word') wrong = result
  }
  return wrong ?? { outcome: 'unrecognized' }
}
