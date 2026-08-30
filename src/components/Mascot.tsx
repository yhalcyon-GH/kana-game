export type MascotMood = 'normal' | 'correct' | 'incorrect' | 'streak'

type Props = {
  mood: MascotMood
}

const MOOD_IMAGE: Record<MascotMood, string> = {
  normal: 'mascot/normal.webp',
  correct: 'mascot/correct.webp',
  incorrect: 'mascot/incorrect.webp',
  streak: 'mascot/streak.webp',
}

// Tamamizu, the app's fox-spirit mascot — sits in the bottom-right of the
// graded mini-games' answer area and reacts to how the round went (see
// useAnswerFeedback, which derives `mood` from the answer feedback +
// consecutive-correct streak). The correct/incorrect/streak art already
// bakes in the ○/✕ mark as a single combined illustration, so no separate
// glyph is drawn alongside it; normal is a plain bust crop.
export function Mascot({ mood }: Props) {
  return <img src={`${import.meta.env.BASE_URL}${MOOD_IMAGE[mood]}`} alt="" className="h-24 w-auto shrink-0 object-contain" />
}
