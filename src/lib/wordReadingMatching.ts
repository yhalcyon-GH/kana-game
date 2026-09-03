import type { AnchorWord } from '../data/types'
import { normalizeJapanese } from './restaurantMatching'

// Speech-recognition checking for the new Word Reading assessment family
// (Issue #189's Family 4) — reuses Restaurant/Cafe's normalizeJapanese
// (NFKC + punctuation-strip + katakana->hiragana folding) so a transcript is
// compared on the same footing, but does NOT reuse RestaurantDish's
// `recognitionAliases` list (vocabulary words have no such curated alias
// list) — instead it builds a small, safe alias set from the target word's
// own kana, optional audioText, and romaji.

export type WordReadingCheckResult = { outcome: 'success' } | { outcome: 'incorrect' } | { outcome: 'unrecognized' }

function normalizeRomaji(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/[\s\-‐‑‒–—'’・,.!?！？。、]/gu, '')
}

// A transcript "reads" the target word correctly if its normalized form
// contains the word's normalized kana spelling. `includes` (not exact
// equality) tolerates SpeechRecognition sometimes prepending/appending
// filler the target word itself doesn't have (e.g. a trailing 。 already
// stripped by normalizeJapanese, or an honorific/particle artifact).
export function checkWordReading(rawTranscript: string, target: AnchorWord): WordReadingCheckResult {
  const normalizedTranscript = normalizeJapanese(rawTranscript)
  if (!normalizedTranscript) return { outcome: 'unrecognized' }
  const japaneseAliases = [target.kana, target.audioText, ...(target.recognitionAliases ?? [])]
    .filter((alias): alias is string => Boolean(alias))
    .map(normalizeJapanese)
    .filter(Boolean)
  if (japaneseAliases.some((alias) => normalizedTranscript.includes(alias))) return { outcome: 'success' }

  const normalizedRomajiTranscript = normalizeRomaji(rawTranscript)
  const normalizedTargetRomaji = normalizeRomaji(target.romaji)
  return normalizedTargetRomaji && normalizedRomajiTranscript.includes(normalizedTargetRomaji)
    ? { outcome: 'success' }
    : { outcome: 'incorrect' }
}

// Checks up to 3 SpeechRecognition alternatives — succeeds if ANY is a
// correct reading, mirrors Restaurant/Cafe's checkOrderAlternatives.
export function checkWordReadingAlternatives(rawAlternatives: string[], target: AnchorWord): WordReadingCheckResult {
  let sawIncorrect = false
  for (let i = 0; i < Math.min(3, rawAlternatives.length); i++) {
    const result = checkWordReading(rawAlternatives[i], target)
    if (result.outcome === 'success') return result
    if (result.outcome === 'incorrect') sawIncorrect = true
  }
  return sawIncorrect ? { outcome: 'incorrect' } : { outcome: 'unrecognized' }
}
