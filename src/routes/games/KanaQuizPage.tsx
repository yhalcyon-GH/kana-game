import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PracticeSummary } from '../../components/PracticeSummary'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useTTS } from '../../hooks/useTTS'
import { isNearMissText } from '../../lib/answerCloseness'
import { pickDistractorCharIds } from '../../lib/distractorPicker'
import { buildWeightedQueue } from '../../lib/practiceSelection'
import { shuffle } from '../../lib/shuffle'
import { useProgressStore } from '../../store/progressStore'

const ROUNDS = 8
const DISTRACTOR_COUNT = 3

// Tests bare kana recall without a word wrapping it: see (and optionally
// hear) a single character, pick its reading from a few choices. Word
// Builder and Listening only ever exercise characters bundled into words —
// this is the one place raw character knowledge gets checked directly.
export function KanaQuizPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady, getScopeCharacterIds, getScopeQuizCharacterIds } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const characters = useProgressStore((s) => s.characters)
  const { speak, supported } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
  const { feedback, mistakes, mistakeIds, onCorrect, onWrong, onPerfect, clear, resetSession } = useAnswerFeedback()

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId)) navigate('/', { replace: true })
  }, [rowId, isScopeReady, navigate])

  const quizCharacterIds = useMemo(() => getScopeQuizCharacterIds(rowId), [rowId, getScopeQuizCharacterIds])
  const distractorPool = useMemo(() => getScopeCharacterIds(rowId), [rowId, getScopeCharacterIds])

  const [queue, setQueue] = useState<string[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [choices, setChoices] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)

  const startSession = useCallback(() => {
    const getBox = (id: string) => characters[id]?.box ?? 0
    setQueue(buildWeightedQueue(quizCharacterIds, getBox, Math.min(ROUNDS, quizCharacterIds.length * 3)))
    setRoundIndex(0)
    setCorrectCount(0)
    setFinished(false)
    resetSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizCharacterIds])

  useEffect(() => {
    if (quizCharacterIds.length > 0) startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizCharacterIds.length])

  // Replays just this session's mistakes, in place, from the finish screen.
  const startMistakeReview = useCallback((ids: string[]) => {
    setQueue(ids)
    setRoundIndex(0)
    setCorrectCount(0)
    setFinished(false)
    resetSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentCharId = queue.length > 0 ? queue[roundIndex] : undefined

  useEffect(() => {
    if (!currentCharId) return
    const distractors = pickDistractorCharIds([currentCharId], distractorPool, DISTRACTOR_COUNT)
    setChoices(shuffle([currentCharId, ...distractors]))
    setSelectedId(null)
    setAnswered(false)
    clear()
    speak(`characters/${currentCharId}`, CHARACTERS_BY_ID[currentCharId].kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharId])

  const advance = useCallback(() => {
    if (roundIndex + 1 >= queue.length) {
      setFinished(true)
    } else {
      setRoundIndex((i) => i + 1)
    }
  }, [roundIndex, queue.length])

  useEffect(() => {
    if (finished && queue.length > 0 && correctCount === queue.length) onPerfect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  useEnterAdvance(answered && selectedId !== currentCharId, advance)

  const handleChoice = (choiceId: string) => {
    if (answered || !currentCharId) return
    setSelectedId(choiceId)
    setAnswered(true)
    const isCorrect = choiceId === currentCharId
    recordResult(currentCharId, isCorrect)
    if (isCorrect) {
      setCorrectCount((c) => c + 1)
      onCorrect()
      setTimeout(advance, 1000)
    } else {
      onWrong(
        { id: currentCharId, kana: CHARACTERS_BY_ID[currentCharId].kana, romaji: CHARACTERS_BY_ID[currentCharId].romaji },
        isNearMissText(CHARACTERS_BY_ID[choiceId].kana, CHARACTERS_BY_ID[currentCharId].kana),
      )
    }
  }

  if (!rowId || !isScopeReady(rowId)) return null
  if (quizCharacterIds.length === 0) return null

  if (finished) {
    return (
      <PracticeSummary
        title="Kana Quiz complete!"
        stats={[{ label: 'Accuracy', value: `${Math.round((correctCount / queue.length) * 100)}%` }]}
        backHref={isReview ? '/review' : `/practice/${rowId}`}
        onRetry={startSession}
        mistakes={mistakes}
        onReviewMistakes={() => startMistakeReview(mistakeIds)}
      />
    )
  }

  if (!currentCharId) return null
  const currentChar = CHARACTERS_BY_ID[currentCharId]

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Round {roundIndex + 1} / {queue.length}
      </p>
      <div className="flex flex-col items-center gap-2">
        <span className="font-kana text-7xl font-bold">{currentChar.kana}</span>
        {supported && (
          <button
            type="button"
            onClick={() => speak(`characters/${currentCharId}`, currentChar.kana)}
            className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            aria-label="Replay audio"
          >
            🔊 Replay
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {choices.map((choiceId) => {
          const choice = CHARACTERS_BY_ID[choiceId]
          const isSelected = selectedId === choiceId
          const isTarget = choiceId === currentCharId
          const showResult = answered && (isSelected || isTarget)
          return (
            <button
              key={choiceId}
              type="button"
              onClick={() => handleChoice(choiceId)}
              disabled={answered}
              className={`rounded-xl border-2 px-6 py-4 text-2xl font-bold transition ${
                showResult
                  ? isTarget
                    ? 'border-green-500 bg-green-50 dark:bg-green-950'
                    : 'border-red-500 bg-red-50 dark:bg-red-950'
                  : 'border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800'
              }`}
            >
              {choice.romaji}
            </button>
          )
        })}
      </div>

      {feedback && (
        <p className={`font-semibold ${feedback.ok ? 'text-red-500' : 'text-blue-500'}`}>
          {feedback.ok ? '○' : '✕'} {feedback.text}
        </p>
      )}

      {answered && selectedId !== currentCharId && (
        <button
          type="button"
          onClick={advance}
          className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Next
        </button>
      )}
    </div>
  )
}
