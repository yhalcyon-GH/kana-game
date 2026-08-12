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

// Tamamizu, the app's fox-spirit mascot — sits in the bottom-right of the
// graded mini-games' answer area and reacts to how the round went (see
// useAnswerFeedback, which derives `mood` from the answer feedback +
// consecutive-correct streak). Art is a bust/upper-body crop so the
// expression reads clearly at this size.
export function Mascot({ mood }: Props) {
  return <img src={`${import.meta.env.BASE_URL}${MOOD_IMAGE[mood]}`} alt="" className="h-24 w-24 shrink-0" />
}
