import type { ReactNode } from 'react'
import { Mascot, type MascotMood } from './Mascot'

type Props = {
  mood: MascotMood
  // Whatever a game wants shown on the left — e.g. the correct kana, or an
  // "Answer: ..." reveal that only appears on a wrong answer. Omit for a
  // game that shows the reading elsewhere instead (see ListeningPage).
  left?: ReactNode
}

// Bottom row shared by all four graded mini-games: game-specific content on
// the left (when given), then Tamamizu herself — her correct/incorrect art
// already bakes in the ○/✕ mark, so no separate glyph is drawn here (see
// useAnswerFeedback for mood; feedback text is still spoken aloud via
// useAnswerFeedback's onCorrect/onWrong).
export function AnswerFeedbackRow({ mood, left }: Props) {
  return (
    <div className="flex w-full items-center justify-between">
      <div>{left}</div>
      <Mascot mood={mood} />
    </div>
  )
}
