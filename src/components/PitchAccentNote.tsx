// One-line reassurance about the red pitch-accent line WordCard draws above
// each word (see WordCard's AccentedKana). Purely presentational — no state,
// no persistence, no "seen it" flag: it simply renders every time a caller
// chooses to show it.
//
// Deliberately shown ONLY on hiragana a-row (あ〜お) — the very first row,
// where the learner meets the accent line for the first time and might
// otherwise mistake it for something they're expected to memorize. Every
// later row omits it rather than repeating the same caveat forever. The two
// screens that show it (LearnPage's Step B word list and TracingPage's
// Overview word section) both gate on PITCH_ACCENT_NOTE_ROW_ID below, so
// "where this appears" lives in exactly one place.
export const PITCH_ACCENT_NOTE_ROW_ID = 'a-row'

export const PITCH_ACCENT_NOTE_TEXT =
  "The red line shows pitch (high / low). It can vary by region and speaker, so don't worry about it too much."

export function PitchAccentNote() {
  return <p className="max-w-md text-center text-sm text-red-500">{PITCH_ACCENT_NOTE_TEXT}</p>
}
