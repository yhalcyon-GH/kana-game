import { useEffect, useState } from 'react'
import { UnbreakableKana } from '../../../components/UnbreakableKana'
import type { AnchorWord } from '../../../data/types'
import { useTTS } from '../../../hooks/useTTS'
import type { ListeningAssessmentQuestion } from '../../../lib/assessment/types'
import { assessmentChoiceClass } from './assessmentChoiceStyles'

type Props = {
  question: ListeningAssessmentQuestion
  wordsById: Record<string, AnchorWord>
  onAnswer: (correct: boolean) => void
}

// Assessment analogue of ListeningPage's "hear a word, pick its kana
// spelling" (Issue #189). Assessment mode differs from normal Listening
// Practice deliberately: no pre-answer romaji hint (normal Listening's
// alwaysShowRomajiHints setting never applies here) and no meaning/image
// shown before answering either, so nothing pre-answer could hint at the
// correct spelling. Normal Listening Practice is untouched.
export function AssessmentListeningQuestion({ question, wordsById, onAnswer }: Props) {
  const { speak, supported } = useTTS()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const targetWord = wordsById[question.targetWordId]

  useEffect(() => {
    setSelectedId(null)
    setAnswered(false)
    if (targetWord) speak(`words/${targetWord.id}`, targetWord.audioText ?? targetWord.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id])

  if (!targetWord) return null

  function handleChoice(choiceId: string) {
    if (answered) return
    setSelectedId(choiceId)
    setAnswered(true)
    onAnswer(choiceId === targetWord.id)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <span className="text-6xl" aria-hidden="true">
          🔊
        </span>
        {supported && (
          <button
            type="button"
            onClick={() => speak(`words/${targetWord.id}`, targetWord.audioText ?? targetWord.kana)}
            className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            aria-label="Replay audio"
          >
            🔊 Replay
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {question.choiceWordIds.map((choiceId) => {
          const choice = wordsById[choiceId]
          if (!choice) return null
          const isSelected = selectedId === choiceId
          const isTarget = choiceId === targetWord.id
          const showResult = answered && (isSelected || isTarget)
          return (
            <button
              key={choiceId}
              type="button"
              onClick={() => handleChoice(choiceId)}
              disabled={answered}
              className={assessmentChoiceClass(showResult, isTarget)}
            >
              <span className="font-kana block">
                <UnbreakableKana kana={choice.kana} />
              </span>
              <span
                className={`block text-sm font-normal text-neutral-500 dark:text-neutral-400 ${answered ? 'visible' : 'invisible'}`}
                aria-hidden={!answered}
              >
                {choice.romaji}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
