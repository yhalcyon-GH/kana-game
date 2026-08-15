// Azure AI Speech Pronunciation Assessment — a SECOND, independent quality
// signal alongside the whisper.cpp+kuroshiro misreading check in
// src/lib/voiceQuality.ts / scripts/asr.ts. That check answers "did the ASR
// transcription roughly match the expected reading" (catches gross
// misreadings like おばあさん -> おそぼさん); this answers "how clearly/
// fluently was it actually articulated" (AccuracyScore/FluencyScore), which
// a bare transcription-match check can't see — a word can transcribe
// correctly while still sounding rushed, mumbled, or clipped. Neither
// replaces the other; checkVoiceQuality.ts runs this ADDITIONALLY, gated
// behind --azure, so it's opt-in (real per-call cost, even though small —
// see docs/2026-08-15-voice-quality-check-design.md and the ChatGPT-authored
// spec this was built from).
//
// Scripted assessment mode only (ReferenceText set — see Azure's docs: this
// is the "reading language learning" scenario, appropriate here since we
// always know the exact intended reading). Prosody assessment is
// deliberately NOT requested — Azure's docs confirm it's en-US only, so it
// would silently no-op (or worse, be misread as "Tokyo accent checked") for
// Japanese; pitch-accent checking is a separate, not-yet-built subsystem
// (see accents.ts's comment and the design doc's "phase 2").
//
// Locale: verified against Azure's official pronunciation-assessment
// language-support table (ja-JP is GA, not preview) before writing this —
// see the includes/language-support/pronunciation-assessment.md source,
// not guessed.
import { readFileSync } from 'node:fs'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

const LOCALE = 'ja-JP'

export type AzureErrorType = 'None' | 'Omission' | 'Insertion' | 'Mispronunciation' | string

export interface AzureWordResult {
  word: string
  accuracyScore: number
  errorType: AzureErrorType
}

export interface AzurePronunciationResult {
  recognizedText: string
  accuracyScore: number
  fluencyScore: number
  completenessScore: number
  pronScore: number
  words: AzureWordResult[]
}

export function requireAzureCredentials(): { key: string; region: string } {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) {
    console.error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION first.')
    process.exit(1)
  }
  return { key, region }
}

// Raw shape of the detailed JSON Azure returns via the
// SpeechServiceResponse_JsonResult property — see the "NBest" doc example
// in learn.microsoft.com/.../how-to-pronunciation-assessment. Only the
// fields this module actually reads are typed; Azure's real response has
// more (Syllables, Phonemes, Offset/Duration, ...).
interface AzureDetailedResult {
  NBest?: {
    PronunciationAssessment?: {
      AccuracyScore?: number
      FluencyScore?: number
      CompletenessScore?: number
      PronScore?: number
    }
    Words?: {
      Word: string
      PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string }
    }[]
  }[]
}

export function assessPronunciation(
  wavPath: string,
  referenceText: string,
  key: string,
  region: string,
): Promise<AzurePronunciationResult> {
  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
    speechConfig.speechRecognitionLanguage = LOCALE

    const audioConfig = sdk.AudioConfig.fromWavFileInput(readFileSync(wavPath))
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)

    // enableMiscue: true — lets ErrorType come back as Omission/Insertion
    // (not just Mispronunciation), matching the ChatGPT spec's ask for
    // "omissions, insertions, mispronunciations" as distinct categories.
    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true,
    )
    pronunciationConfig.applyTo(recognizer)

    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close()
        try {
          const rawJson = result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)
          const parsed: AzureDetailedResult = JSON.parse(rawJson)
          const best = parsed.NBest?.[0]
          const pa = best?.PronunciationAssessment
          resolve({
            recognizedText: result.text ?? '',
            accuracyScore: pa?.AccuracyScore ?? 0,
            fluencyScore: pa?.FluencyScore ?? 0,
            completenessScore: pa?.CompletenessScore ?? 0,
            pronScore: pa?.PronScore ?? 0,
            words: (best?.Words ?? []).map((w) => ({
              word: w.Word,
              accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? 0,
              errorType: (w.PronunciationAssessment?.ErrorType as AzureErrorType) ?? 'None',
            })),
          })
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      },
      (err) => {
        recognizer.close()
        reject(new Error(String(err)))
      },
    )
  })
}
