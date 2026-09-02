import { useEffect, useState } from 'react'
import { CHARACTERS_BY_ID, getCharacterAudioId } from '../../../data/characters'
import { useTTS } from '../../../hooks/useTTS'
import type { KanaQuizAssessmentQuestion } from '../../../lib/assessment/types'
import { assessmentChoiceClass } from './assessmentChoiceStyles'

type Props = {
  question: KanaQuizAssessmentQuestion
  onAnswer: (correct: boolean) => void
}

// Assessment analogue of KanaQuizPage's Read/Recall rendering (Issue #189) —
// same visual language and both-direction coverage, driven by a
// precomputed question (target/mode/choices) instead of a live row-based
// session queue. Normal Kana Quiz Practice is untouched.
export function AssessmentKanaQuizQuestion({ question, onAnswer }: Props) {
  const { speak, supported } = useTTS()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const currentChar = CHARACTERS_BY_ID[question.targetCharId]

  useEffect(() => {
    setSelectedId(null)
    setAnswered(false)
    if (question.mode === 'recall') {
      speak(`characters/${getCharacterAudioId(question.targetCharId)}`, currentChar.kana)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id])

  function handleChoice(choiceId: string) {
    if (answered) return
    setSelectedId(choiceId)
    setAnswered(true)
    onAnswer(choiceId === question.targetCharId)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        {question.mode === 'read' ? (
          <span className="font-kana text-7xl font-bold whitespace-nowrap">{currentChar.kana}</span>
        ) : (
          <span className="text-6xl" aria-hidden="true">
            🔊
          </span>
        )}
        {question.mode === 'recall' && (
          <span className={`text-2xl font-semibold ${answered ? 'visible' : 'invisible'}`} aria-hidden={!answered}>
            {currentChar.displayLabel ?? currentChar.romaji}
          </span>
        )}
        {supported && question.mode === 'recall' && (
          <button
            type="button"
            onClick={() => speak(`characters/${getCharacterAudioId(question.targetCharId)}`, currentChar.kana)}
            className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            aria-label="Replay audio"
          >
            🔊 Replay
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {question.choiceCharIds.map((choiceId) => {
          const choice = CHARACTERS_BY_ID[choiceId]
          const isSelected = selectedId === choiceId
          const isTarget = choiceId === question.targetCharId
          const showResult = answered && (isSelected || isTarget)
          return (
            <button
              key={choiceId}
              type="button"
              onClick={() => handleChoice(choiceId)}
              disabled={answered}
              className={assessmentChoiceClass(showResult, isTarget)}
            >
              {question.mode === 'recall' ? (
                <span className="font-kana whitespace-nowrap">{choice.kana}</span>
              ) : (
                (choice.displayLabel ?? choice.romaji)
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
