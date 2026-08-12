export type MascotMood = 'normal' | 'correct' | 'incorrect' | 'streak'

type Props = {
  mood: MascotMood
}

const MOOD_IMAGE: Record<MascotMood, string> = {
  normal: 'mascot/normal.png',
  correct: 'mascot/correct.png',
  incorrect: 'mascot/incorrect.png',
  streak: 'mascot/streak.png',
}

// Tamamizu, the app's fox-spirit mascot — sits beside the question in the
// graded mini-games and reacts to how the round went (see useAnswerFeedback,
// which derives `mood` from the answer feedback + consecutive-correct streak).
export function Mascot({ mood }: Props) {
  return <img src={`${import.meta.env.BASE_URL}${MOOD_IMAGE[mood]}`} alt="" className="h-16 w-16 shrink-0" />
}
