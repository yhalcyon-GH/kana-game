import type { AnswerFeedback } from '../hooks/useAnswerFeedback'
import { Mascot, type MascotMood } from './Mascot'

type Props = {
  feedback: AnswerFeedback | null
  mood: MascotMood
}

// Bottom row shared by all four graded mini-games: the ○/✕ comment on the
// left, Tamamizu's reaction on the right (see useAnswerFeedback for both).
export function AnswerFeedbackRow({ feedback, mood }: Props) {
  return (
    <div className="flex w-full items-center justify-between">
      <p className={`font-semibold ${feedback ? (feedback.ok ? 'text-red-500' : 'text-blue-500') : ''}`}>
        {feedback && `${feedback.ok ? '○' : '✕'} ${feedback.text}`}
      </p>
      <Mascot mood={mood} />
    </div>
  )
}
