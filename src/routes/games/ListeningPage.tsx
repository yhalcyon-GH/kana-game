import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackToHubLink } from '../../components/BackToHubLink'
import { PracticeSummary } from '../../components/PracticeSummary'
import { ROWS_BY_ID } from '../../data/curriculum'
import type { AnchorWord } from '../../data/types'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useTTS } from '../../hooks/useTTS'
import { isNearMissText } from '../../lib/answerCloseness'
import { pickDistractorWords } from '../../lib/distractorPicker'
import { buildWeightedQueue } from '../../lib/practiceSelection'
import { shuffle } from '../../lib/shuffle'
import { useProgressStore } from '../../store/progressStore'

const ROUNDS = 8

export function ListeningPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady, getScopeWords } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const characters = useProgressStore((s) => s.characters)
  const isReview = rowId === REVIEW_SCOPE_ID
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined
  const { speak, supported } = useTTS()
  const { feedback, mistakes, mistakeIds, onCorrect, onWrong, onPerfect, clear, resetSession } = useAnswerFeedback()

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId)) navigate('/', { replace: true })
  }, [rowId, isScopeReady, navigate])

  const scopeWords = useMemo(() => getScopeWords(rowId), [rowId, getScopeWords])
  const wordsById = useMemo(() => Object.fromEntries(scopeWords.map((w) => [w.id, w])), [scopeWords])
  const wordWeight = useCallback(
    (wordId: string) => {
      const word = wordsById[wordId]
      if (!word) return 0
      return Math.min(...word.characterIds.map((c) => characters[c]?.box ?? 0))
    },
    [wordsById, characters],
  )

  const [queue, setQueue] = useState<string[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [choices, setChoices] = useState<AnchorWord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)

  const startSession = useCallback(() => {
    const wordIds = scopeWords.map((w) => w.id)
    setQueue(buildWeightedQueue(wordIds, wordWeight, Math.min(ROUNDS, wordIds.length * 3)))
    setRoundIndex(0)
    setCorrectCount(0)
    setFinished(false)
    resetSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeWords])

  useEffect(() => {
    if (scopeWords.length > 0) startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeWords.length])

  // Replays just this session's mistakes, in place, from the finish screen.
  const startMistakeReview = useCallback((ids: string[]) => {
    setQueue(ids)
    setRoundIndex(0)
    setCorrectCount(0)
    setFinished(false)
    resetSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentWord = queue.length > 0 ? wordsById[queue[roundIndex]] : undefined

  useEffect(() => {
    if (!currentWord) return
    const distractors = pickDistractorWords(currentWord, scopeWords, 3)
    setChoices(shuffle([currentWord, ...distractors]))
    setSelectedId(null)
    setAnswered(false)
    clear()
    speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord?.id])

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

  useEnterAdvance(answered && selectedId !== currentWord?.id, advance)

  const handleChoice = (choice: AnchorWord) => {
    if (answered || !currentWord) return
    setSelectedId(choice.id)
    setAnswered(true)
    const isCorrect = choice.id === currentWord.id
    // Simplification: distractor words may differ in length from the
    // target, so failure is attributed to the whole target word rather
    // than a single differing character.
    for (const charId of currentWord.characterIds) recordResult(charId, isCorrect)
    if (isCorrect) {
      setCorrectCount((c) => c + 1)
      onCorrect()
      setTimeout(advance, 1000)
    } else {
      onWrong(
        { id: currentWord.id, kana: currentWord.kana, romaji: currentWord.romaji },
        isNearMissText(choice.kana, currentWord.kana),
      )
    }
  }

  if (!rowId || (!isReview && !row)) return null
  if (scopeWords.length === 0) return null

  if (finished) {
    return (
      <PracticeSummary
        title="Listening complete!"
        stats={[{ label: 'Accuracy', value: `${Math.round((correctCount / queue.length) * 100)}%` }]}
        backHref={isReview ? '/review' : `/practice/${rowId}`}
        onRetry={startSession}
        mistakes={mistakes}
        onReviewMistakes={() => startMistakeReview(mistakeIds)}
      />
    )
  }

  if (!currentWord) return null

  return (
    <div className="flex flex-col items-center gap-6">
      <BackToHubLink rowId={rowId} />
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Round {roundIndex + 1} / {queue.length}
      </p>
      <div className="flex flex-col items-center gap-2">
        <span className="text-5xl">{currentWord.emoji}</span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{currentWord.meaning}</span>
        {supported && (
          <button
            type="button"
            onClick={() => speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)}
            className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            aria-label="Replay audio"
          >
            🔊 Replay
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {choices.map((choice) => {
          const isSelected = selectedId === choice.id
          const isTarget = choice.id === currentWord.id
          const showResult = answered && (isSelected || isTarget)
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => handleChoice(choice)}
              disabled={answered}
              className={`font-kana rounded-xl border-2 px-6 py-4 text-2xl font-bold transition ${
                showResult
                  ? isTarget
                    ? 'border-green-500 bg-green-50 dark:bg-green-950'
                    : 'border-red-500 bg-red-50 dark:bg-red-950'
                  : 'border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800'
              }`}
            >
              {choice.kana}
            </button>
          )
        })}
      </div>

      {feedback && (
        <p className={`font-semibold ${feedback.ok ? 'text-red-500' : 'text-blue-500'}`}>
          {feedback.ok ? '○' : '✕'} {feedback.text}
        </p>
      )}

      {answered && selectedId !== currentWord.id && (
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
