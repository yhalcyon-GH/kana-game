// Feedback voice lines played after answering in the graded mini-games
// (Kana Quiz, Listening, Kana Typing, Word Builder — NOT Tracing, which is
// ungraded and has no "correct answer"). Voiced by MANA, a COEIROINK
// default character distinct from つくよみちゃん (used everywhere else in
// this app), using her named emotion styles — see
// scripts/generateFeedbackAudio.ts for how these are synthesized to
// public/audio/feedback/<id>.wav, and lib/feedbackVoice.ts for the runtime
// pick logic (streak bonuses + rare Easter-egg lines).
export const FEEDBACK_SPEAKER_UUID = '292ea286-3d5f-f1cc-157c-66462a6a9d08' // MANA

export type StyleOption = { key: string; styleId: number }

export const CORRECT_STYLES: StyleOption[] = [
  { key: 'gokigen', styleId: 40 }, // ごきげん
  { key: 'hissatsu', styleId: 44 }, // ひっさつわざ
]
export const CORRECT_RARE_STYLE: StyleOption = { key: 'naisho', styleId: 43 } // ないしょばなし
export const CORRECT_RARE_STYLE_CHANCE = 0.01

export const INCORRECT_STYLES: StyleOption[] = [
  { key: 'shonbori', styleId: 42 }, // しょんぼり
  { key: 'isshoukenmei', styleId: 7 }, // いっしょうけんめい
]
export const INCORRECT_RARE_STYLE: StyleOption = { key: 'fukurettsura', styleId: 41 } // ふくれっつら
export const INCORRECT_RARE_STYLE_CHANCE = 0.01

export type Phrase = { key: string; text: string }

// Regular pool, picked at random on a correct answer.
export const CORRECT_PHRASES: Phrase[] = [
  { key: 'seikai', text: 'せいかい' },
  { key: 'yatta', text: 'やった' },
]
// Replaces the regular pick when the consecutive-correct streak hits these
// exact counts (see lib/feedbackVoice.ts).
export const STREAK_3_PHRASE: Phrase = { key: 'sugoi', text: 'すごい' }
export const STREAK_5_PHRASE: Phrase = { key: 'saikou', text: 'さいこう' }
// Played once at session end when every answer was correct.
export const PERFECT_PHRASE: Phrase = { key: 'kanpeki', text: 'かんぺき' }

export const INCORRECT_PHRASES: Phrase[] = [
  { key: 'daijoubu', text: 'だいじょうぶ' },
  { key: 'donmai', text: 'ドンマイ' },
  { key: 'oshii', text: 'おしい' },
  { key: 'ganbatte', text: 'がんばって' },
  { key: 'zannen', text: 'ざんねん' },
]

// おしい ("so close!") is only fair when the wrong answer really was close —
// see lib/answerCloseness.ts / lib/feedbackVoice.ts's pickIncorrectFeedback.
export const NEAR_MISS_ONLY_PHRASE_KEY = 'oshii'

// Rare Easter-egg lines that can replace a normal correct pick entirely —
// each has its own fixed style/id rather than joining the
// gokigen/hissatsu/naisho rotation above.
export type BonusLine = { id: string; text: string; styleId: number; chance: number }
export const BONUS_LINES: BonusLine[] = [
  { id: 'horechau', text: 'ほれちゃう', styleId: 44, chance: 0.001 }, // ひっさつわざ
  { id: 'kakkoii', text: 'かっこいい', styleId: 44, chance: 0.01 }, // ひっさつわざ
]
