// Hand-tuned COEIROINK accent/intonation data for the "correct answer"
// feedback phrases (see feedback.ts), extracted from a COEIROINK project
// file (正解エフェクト.cink) where the user tuned the pitch accent for all
// seven phrases read together as MANA (ひっさつわざ style). Passed back to
// the synthesis API as `prosodyDetail` in scripts/generateFeedbackAudio.ts
// so the shipped clips keep this accent shape regardless of which style
// variant (gokigen/hissatsu/naisho) they're actually voiced in — accent
// pattern is a property of how the word is pronounced, not of the vocal
// style performing it.
export type Mora = { phoneme: string; hira: string; accent: number }

export const FEEDBACK_PROSODY: Record<string, Mora[]> = {
  seikai: [
    { phoneme: 's-e', hira: 'せ', accent: 0 },
    { phoneme: 'i', hira: 'い', accent: 1 },
    { phoneme: 'k-a', hira: 'か', accent: 1 },
    { phoneme: 'i', hira: 'い', accent: 1 },
  ],
  yatta: [
    { phoneme: 'y-a', hira: 'や', accent: 0 },
    { phoneme: 'cl', hira: 'っ', accent: 1 },
    { phoneme: 't-a', hira: 'た', accent: 1 },
  ],
  sugoi: [
    { phoneme: 's-u', hira: 'す', accent: 0 },
    { phoneme: 'g-o', hira: 'ご', accent: 1 },
    { phoneme: 'i', hira: 'い', accent: 0 },
  ],
  saikou: [
    { phoneme: 's-a', hira: 'さ', accent: 0 },
    { phoneme: 'i', hira: 'い', accent: 1 },
    { phoneme: 'k-o', hira: 'こ', accent: 1 },
    { phoneme: 'o', hira: 'お', accent: 1 },
  ],
  kanpeki: [
    { phoneme: 'k-a', hira: 'か', accent: 0 },
    { phoneme: 'N', hira: 'ん', accent: 1 },
    { phoneme: 'p-e', hira: 'ぺ', accent: 1 },
    { phoneme: 'k-i', hira: 'き', accent: 1 },
  ],
  kakkoii: [
    { phoneme: 'k-a', hira: 'か', accent: 0 },
    { phoneme: 'cl', hira: 'っ', accent: 1 },
    { phoneme: 'k-o', hira: 'こ', accent: 1 },
    { phoneme: 'i', hira: 'い', accent: 1 },
    { phoneme: 'i', hira: 'い', accent: 0 },
  ],
  horechau: [
    { phoneme: 'h-o', hira: 'ほ', accent: 0 },
    { phoneme: 'r-e', hira: 'れ', accent: 1 },
    { phoneme: 'ch-a', hira: 'ちゃ', accent: 1 },
    { phoneme: 'u', hira: 'う', accent: 1 },
  ],
}

// intonationScale recorded on the tuned project — applied alongside
// FEEDBACK_PROSODY so the overall pitch movement matches, not just the
// per-mora accent bits.
export const FEEDBACK_PROSODY_INTONATION_SCALE = 1.01
