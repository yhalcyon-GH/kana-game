// Compares an ASR-transcribed reading of a generated word clip against the
// word's expected reading (word.kana — already the authoritative reading in
// this codebase, since kana never contains kanji; see
// docs/2026-08-15-voice-quality-check-design.md). Comparison is mora-based,
// not character-based, so e.g. a single dropped/added mora scores as "one
// mistake" regardless of how many UTF-16 characters that mora happens to be
// (きゃ is 2 characters but 1 mora). Pure and framework-agnostic — no ASR
// call or file I/O here, see scripts/asr.ts for that.
import { toHiragana } from './answerChecking'
import { levenshteinDistance } from './answerCloseness'
import { toMorae } from './mora'

export interface VoiceCheckThresholds {
  passScore: number
  warningScore: number
}

export type PronunciationStatus = 'PASS' | 'WARNING' | 'FAIL'

export interface PronunciationCheckResult {
  expectedReading: string
  detectedReading: string
  pronunciationScore: number
  pronunciationStatus: PronunciationStatus
  reasons: string[]
}

export function checkPronunciation(
  expectedKana: string,
  detectedHiragana: string,
  thresholds: VoiceCheckThresholds,
): PronunciationCheckResult {
  const expectedReading = toHiragana(expectedKana)
  const expectedMorae = toMorae(expectedReading)
  const detectedMorae = toMorae(detectedHiragana)

  const distance = levenshteinDistance(expectedMorae, detectedMorae)
  const maxLen = Math.max(expectedMorae.length, detectedMorae.length, 1)
  const pronunciationScore = Math.round(100 * (1 - distance / maxLen))

  const pronunciationStatus: PronunciationStatus =
    pronunciationScore >= thresholds.passScore
      ? 'PASS'
      : pronunciationScore >= thresholds.warningScore
        ? 'WARNING'
        : 'FAIL'

  const reasons: string[] =
    pronunciationStatus === 'PASS'
      ? []
      : [`Expected ${expectedReading} but detected ${detectedHiragana || '(empty)'}`]

  return { expectedReading, detectedReading: detectedHiragana, pronunciationScore, pronunciationStatus, reasons }
}
