import type { ReactNode } from 'react'
import { Mascot, type MascotMood } from './Mascot'

type Props = {
  mood: MascotMood
  // Whether the Next button should render this round — true on BOTH correct
  // and wrong answers, but never before an answer is given. Graded flows
  // stay on their feedback state until the learner explicitly chooses Next.
  showNext: boolean
  onNext: () => void
  // Only ever passed on a WRONG answer (Save is never offered on correct —
  // existing Practice rule, unchanged). Rendered as-is; callers pass one of
  // the existing SaveCharacterToggle/SaveWordToggle components.
  saveControl?: ReactNode
}

// Bottom row shared by all four graded mini-games. Fixed 2:1 layout: left
// 2/3 is a fixed-size "stage" that only ever shows Tamamizu (her correct/
// incorrect art already bakes in the ○/✕ mark, so no separate glyph is drawn
// here — see useAnswerFeedback for mood; feedback text is still spoken aloud
// via useAnswerFeedback's onCorrect/onWrong), right 1/3 is an action column
// (Next above, Save below). Both the mascot stage and the two action slots
// reserve constant space regardless of mood/answered state, so switching
// moods or showing/hiding Next/Save never moves the mascot's bounding box —
// this is what lets Tamamizu appear to react "in place." Per-game content
// (AnswerReveal, correct-answer text, reading/romaji display) must NOT be
// passed in here anymore — each game now renders that itself, elsewhere in
// its own layout, reserving its own space (see KanaQuizPage/ListeningPage/
// WordBuilderPage/KanaTypingPage for how).
export function AnswerFeedbackRow({ mood, showNext, onNext, saveControl }: Props) {
  return (
    <div className="grid w-full grid-cols-[2fr_1fr] items-end gap-3">
      <div data-testid="mascot-stage" className="flex min-h-24 items-end justify-start">
        <Mascot mood={mood} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="min-h-[2.5rem]">
          {showNext && (
            <button
              type="button"
              onClick={onNext}
              className="w-full rounded-full bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Next
            </button>
          )}
        </div>
        <div className="min-h-[2.25rem]">{saveControl}</div>
      </div>
    </div>
  )
}
