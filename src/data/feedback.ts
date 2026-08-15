// Answer-feedback voice lines for the graded mini-games (Kana Quiz,
// Listening, Kana Typing, Word Builder — NOT Tracing, which is ungraded and
// has no "correct answer"). Voiced by Tamamizu, the app's mascot (ElevenLabs
// voice_id AhtKs6h2Q4XbfAjEfKa2 — see project_kana_game_elevenlabs_voice
// memory), one clip per line at public/audio/feedback/<id>.wav. Ten lines
// total (see scripts/generateFeedbackAudio.ts to regenerate); see
// lib/feedbackVoice.ts for when each one plays.
export type FeedbackLine = { id: string; text: string }

export const SEIKAI: FeedbackLine = { id: 'seikai', text: 'せいかい' } // default correct answer
export const SUGOI: FeedbackLine = { id: 'sugoi', text: 'すごい' } // 3-in-a-row
export const SAIKOU: FeedbackLine = { id: 'saikou', text: 'さいこう' } // 5-in-a-row
export const KAKKOII: FeedbackLine = { id: 'kakkoii', text: 'かっこいい' } // rare 5-in-a-row alternate
export const KANPEKI: FeedbackLine = { id: 'kanpeki', text: 'かんぺき' } // eval screen: 0 mistakes
export const IINE: FeedbackLine = { id: 'iine', text: 'いいね' } // eval screen: exactly 2 mistakes

export const OSHII: FeedbackLine = { id: 'oshii', text: 'おしい' } // near-miss wrong answer / eval screen: exactly 1 mistake
export const DONMAI: FeedbackLine = { id: 'donmai', text: 'ドンマイ' } // wrong answer / eval screen: 3+ mistakes
export const GANBATTE: FeedbackLine = { id: 'ganbatte', text: 'がんばって' } // wrong answer
export const ZANNEN: FeedbackLine = { id: 'zannen', text: 'ざんねん' } // wrong answer

// Random pool for a wrong answer during play. おしい ("so close!") only
// belongs in the pool when the wrong answer was a near-miss (see
// lib/answerCloseness.ts / lib/feedbackVoice.ts) — it'd be a strange thing
// to say about a wild guess.
export const INCORRECT_LINES: FeedbackLine[] = [OSHII, DONMAI, GANBATTE, ZANNEN]
export const NEAR_MISS_ONLY_ID = OSHII.id

// Chance かっこいい pre-empts さいこう on hitting a 5-streak.
export const KAKKOII_CHANCE = 0.01
