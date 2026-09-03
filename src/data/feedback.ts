// Answer-feedback voice lines for the graded mini-games (Kana Quiz,
// Listening, Kana Typing, Word Builder — NOT Tracing, which is ungraded and
// has no "correct answer"). Voiced by Tamamizu, the app's mascot, one clip
// per line at public/audio/feedback/<id>.wav (source material and the
// original spec archived under design/audio/character-voice/).
// See lib/feedbackVoice.ts for when each one plays.
export type FeedbackLine = { id: string; text: string }

// --- Per-answer: wrong. Random pick, never the same line twice in a row. ---
// WRONG_OSHII ("close!") is reserved for a genuine near miss (see
// lib/nearMiss.ts) — pickIncorrectFeedback only draws it from
// NEAR_MISS_INCORRECT_LINES when the caller has established the wrong
// answer was actually close; every other wrong answer draws from
// NON_NEAR_MISS_INCORRECT_LINES instead, which excludes it.
export const WRONG_OSHII: FeedbackLine = { id: 'wrong_oshii', text: '惜しい！' }
export const WRONG_GANBARE: FeedbackLine = { id: 'wrong_ganbare', text: '頑張れ！' }
export const WRONG_DAIJOUBU: FeedbackLine = { id: 'wrong_daijoubu', text: '大丈夫！' }
export const INCORRECT_LINES: FeedbackLine[] = [WRONG_OSHII, WRONG_GANBARE, WRONG_DAIJOUBU]
export const NEAR_MISS_INCORRECT_LINES: FeedbackLine[] = [WRONG_OSHII, WRONG_GANBARE, WRONG_DAIJOUBU]
export const NON_NEAR_MISS_INCORRECT_LINES: FeedbackLine[] = [WRONG_GANBARE, WRONG_DAIJOUBU]

// --- Per-answer: correct, no streak milestone hit. Same random-no-repeat rule. ---
export const CORRECT_IINE: FeedbackLine = { id: 'correct_iine', text: 'いいね！' }
export const CORRECT_SEIKAI: FeedbackLine = { id: 'correct_seikai', text: '正解！' }
export const CORRECT_SONOCHOUSHI: FeedbackLine = { id: 'correct_sonochoushi', text: 'その調子！' }
export const NORMAL_CORRECT_LINES: FeedbackLine[] = [CORRECT_IINE, CORRECT_SEIKAI, CORRECT_SONOCHOUSHI]

// --- Per-answer: correct, streak milestone. Replaces the normal pool
// entirely at that exact streak count — only one voice ever plays.
export const STREAK_5_SUGOI: FeedbackLine = { id: 'streak_5_sugoi', text: 'すごい！' }
export const STREAK_8_KANPEKI: FeedbackLine = { id: 'streak_8_kanpeki', text: '完璧！' }
export const STREAK_10_SAIKOU: FeedbackLine = { id: 'streak_10_saikou', text: '最高！' }
export const STREAK_15_PERFECT: FeedbackLine = { id: 'streak_15_perfect', text: 'パーフェクト！' }

// Most graded sessions remain 8 questions and summary sessions remain 15.
// Issue #180 adds Kana-Quiz-only 12- and 16-question modes for the large
// は/ハ and first Katakana rows. They reuse the already-recorded milestone
// clips; no new voice assets or feedback semantics are introduced.
export type QuestionMode = 8 | 12 | 15 | 16 | 20 | 30
export const STREAK_MILESTONES: Record<QuestionMode, Record<number, FeedbackLine>> = {
  8: { 5: STREAK_5_SUGOI, 8: STREAK_8_KANPEKI },
  12: { 5: STREAK_5_SUGOI, 8: STREAK_8_KANPEKI, 10: STREAK_10_SAIKOU },
  15: { 5: STREAK_5_SUGOI, 8: STREAK_8_KANPEKI, 10: STREAK_10_SAIKOU, 15: STREAK_15_PERFECT },
  16: { 5: STREAK_5_SUGOI, 8: STREAK_8_KANPEKI, 10: STREAK_10_SAIKOU, 15: STREAK_15_PERFECT },
  // Assessments deliberately avoid completion-sounding streak milestones;
  // their only final evaluation belongs on the result screen.
  20: {},
  30: {},
}

// --- Session-end evaluation screen. A separate mechanism from the
// per-answer feedback above, judged purely on accuracy (correctCount /
// questionCount, unrounded) rather than mistake count — see
// pickResultFeedback. The same fraction thresholds apply regardless of
// 8/12/15/16-question session size.
export const KANPEKI: FeedbackLine = { id: 'kanpeki', text: 'かんぺき' } // accuracy === 1
export const SUGOI: FeedbackLine = { id: 'sugoi', text: 'すごい' } // accuracy >= 0.8
export const EVAL_FAITO: FeedbackLine = { id: 'eval_faito', text: 'ファイト' } // accuracy < 0.4
