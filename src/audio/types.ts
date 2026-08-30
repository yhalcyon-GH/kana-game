// A single content-addressed thing to say — game code only ever deals in
// these two fields, never in how the audio is actually produced. `key`
// identifies a pre-generated clip (e.g. "characters/ka", "words/ka-aka",
// "feedback/seikai" — matching the folders under public/audio/); `text` is
// the literal text to fall back to if no provider can produce audio for
// `key` (see WebSpeechProvider).
export type SpeechRequest = {
  key: string
  text: string
  // BCP-47 language tag for the Web Speech fallback (e.g. 'en-US') — omit
  // for the app's default Japanese narration (characters/words/feedback).
  // Irrelevant to StaticFileProvider (a pre-generated clip is whatever
  // language it was recorded in); only WebSpeechProvider reads this.
  lang?: string
}

export type SpeechPlaybackOptions = {
  volume: number
  rate: number
}

// One TTS/audio backend. `speak` should reject (not throw synchronously) on
// any failure — missing clip, network error, playback blocked — so callers
// can fall back to another provider. See hooks/useTTS.ts for how the app
// chains providers together, and docs/audio-provider-interface.md for the
// design this is part of.
export interface SpeechProvider {
  speak(request: SpeechRequest, options: SpeechPlaybackOptions): Promise<void>
}
