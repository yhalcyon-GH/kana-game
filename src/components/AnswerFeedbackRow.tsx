import type { ReactNode } from 'react'
import type { AnswerFeedback } from '../hooks/useAnswerFeedback'
import { Mascot, type MascotMood } from './Mascot'

type Props = {
  feedback: AnswerFeedback | null
  mood: MascotMood
  // Whatever a game wants shown on the left — e.g. the correct kana, or an
  // "Answer: ..." reveal that only appears on a wrong answer. Omit for a
  // game that shows the reading elsewhere instead (see ListeningPage).
  left?: ReactNode
}

// Bottom row shared by all four graded mini-games: game-specific content on
// the left (when given), then a big ○/✕ badge immediately left of Tamamizu,
// then Tamamizu herself (see useAnswerFeedback for both feedback and mood)
// — no text comment here any more, though it's still spoken aloud (see
// useAnswerFeedback's onCorrect/onWrong).
export function AnswerFeedbackRow({ feedback, mood, left }: Props) {
  return (
    <div className="flex w-full items-center justify-between">
      <div>{left}</div>
      <div className="flex items-center gap-2">
        {feedback && (
          <span
            className={`-translate-y-3 text-6xl font-black ${feedback.ok ? 'text-red-500' : 'text-blue-500'}`}
            style={{ WebkitTextStroke: '2px currentColor' }}
            aria-hidden="true"
          >
            {feedback.ok ? '○' : '✕'}
          </span>
        )}
        <Mascot mood={mood} />
      </div>
    </div>
  )
}
