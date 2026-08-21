import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { GameRoundHeader } from '../../components/GameRoundHeader'
import { PracticeSummary } from '../../components/PracticeSummary'
import { WordImage } from '../../components/WordImage'
import { ROWS_BY_ID } from '../../data/curriculum'
import type { QuestionMode } from '../../data/feedback'
import type { AnchorWord } from '../../data/types'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useDelayedAction } from '../../hooks/useDelayedAction'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useFrozenWordPool } from '../../hooks/useFrozenWordPool'
import { useGameSession } from '../../hooks/useGameSession'
import { useTTS } from '../../hooks/useTTS'
import { pickDistractorWords } from '../../lib/distractorPicker'
import { shuffle } from '../../lib/shuffle'
import { REVIEW_SCORE_HIT_IMPRECISE, REVIEW_SCORE_HIT_WORD, REVIEW_SCORE_MISS_IMPRECISE, REVIEW_SCORE_MISS_WORD } from '../../lib/srs'
import { useProgressStore } from '../../store/progressStore'

type Props = {
  // Set only by the /practice/review/listening route — see REVIEW_SCOPE_ID.
  rowIdOverride?: string
}

export function ListeningPage({ rowIdOverride }: Props = {}) {
  const params = useParams<{ categoryId?: string; rowId?: string }>()
  const rowId = rowIdOverride ?? params.rowId
  const navigate = useNavigate()
  const { isScopeReady, getScopeWords, getScopeRounds } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const adjustCharacterReviewScore = useProgressStore((s) => s.adjustCharacterReviewScore)
  const adjustWordReviewScore = useProgressStore((s) => s.adjustWordReviewScore)
  const characters = useProgressStore((s) => s.characters)
  const isReview = rowId === REVIEW_SCOPE_ID
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined
  const categoryId = isReview ? undefined : (params.categoryId ?? row?.categoryId)
  const { speak, supported } = useTTS()
  const rounds = getScopeRounds(rowId)
  const {
    feedback,
    mood,
    mistakes,
    mistakeIds,
    onCorrect,
    onWrong,
    onFinish,
    finishFeedback,
    finishMood,
    clear,
    resetSession,
  } = useAnswerFeedback(rounds as QuestionMode)

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId) || (!isReview && row?.categoryId !== categoryId)) {
      navigate('/', { replace: true })
    }
  }, [rowId, isReview, row, categoryId, isScopeReady, navigate])

  const scopeWords = useMemo(() => getScopeWords(rowId), [rowId, getScopeWords])
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const sessionKey = `${rowId ?? ''}:${sessionAttempt}`
  const { wordIds, wordsById } = useFrozenWordPool(sessionKey, scopeWords)
  const wordWeight = useCallback(
    (wordId: string) => {
      const word = wordsById[wordId]
      if (!word) return 0
      return Math.min(...word.characterIds.map((c) => characters[c]?.box ?? 0))
    },
    [wordsById, characters],
  )

  const { queue, roundIndex, correctCount, setCorrectCount, finished, startMistakeReview, advance } =
    useGameSession({ ids: wordIds, weight: wordWeight, onFinish, resetSession, rounds, sessionKey })
  const { schedule: scheduleAdvance } = useDelayedAction()

  const [choices, setChoices] = useState<AnchorWord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)

  const currentWord = queue.length > 0 ? wordsById[queue[roundIndex]] : undefined

  useEffect(() => {
    if (!currentWord) return
    const distractors = pickDistractorWords(currentWord, scopeWords, 3)
    setChoices(shuffle([currentWord, ...distractors]))
    setSelectedId(null)
    setAnswered(false)
    clear()
    speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)
    // Keyed on roundIndex too, not just currentWord.id — a small pool (e.g.
    // Review with only 1-2 weak words) can put the same word in
    // consecutive rounds, and this effect must still reset per-round state
    // even when the id doesn't change, or the next round renders already
    // "answered" from the previous one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord?.id, roundIndex])

  useEnterAdvance(answered && selectedId !== currentWord?.id, advance)

  const handleChoice = (choice: AnchorWord) => {
    if (answered || !currentWord) return
    setSelectedId(choice.id)
    setAnswered(true)
    const isCorrect = choice.id === currentWord.id
    // Simplification: distractor words may differ in length from the
    // target, so failure is attributed to the whole target word rather
    // than a single differing character — same "imprecise" review-score
    // step every character in the word gets (see lib/srs.ts).
    for (const charId of currentWord.characterIds) {
      recordResult(charId, isCorrect)
      adjustCharacterReviewScore(charId, isCorrect ? REVIEW_SCORE_HIT_IMPRECISE : REVIEW_SCORE_MISS_IMPRECISE)
    }
    adjustWordReviewScore(currentWord.id, isCorrect ? REVIEW_SCORE_HIT_WORD : REVIEW_SCORE_MISS_WORD)
    if (isCorrect) {
      setCorrectCount((c) => c + 1)
      onCorrect()
      scheduleAdvance(advance, 2000)
    } else {
      onWrong({ id: currentWord.id, kana: currentWord.kana, romaji: currentWord.romaji })
    }
  }

  if (!rowId || (!isReview && !row)) return null
  if (scopeWords.length === 0) return null

  if (finished) {
    return (
      <PracticeSummary
        title="Listening complete!"
        stats={[{ label: 'Accuracy', value: `${Math.round((correctCount / queue.length) * 100)}%` }]}
        backHref={isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`}
        onRetry={() => setSessionAttempt((attempt) => attempt + 1)}
        mistakes={mistakes}
        onReviewMistakes={() => startMistakeReview(mistakeIds)}
        mood={finishMood ?? undefined}
        comment={finishFeedback?.text}
      />
    )
  }

  if (!currentWord) return null

  return (
    <div className="flex flex-col items-center gap-6">
      <GameRoundHeader rowId={rowId} categoryId={categoryId} roundIndex={roundIndex} total={queue.length} />
      <div className="flex flex-col items-center gap-2">
        <WordImage word={currentWord} className="h-20 w-20" />
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
              className={`rounded-xl border-2 px-6 py-4 text-2xl font-bold transition ${
                showResult
                  ? isTarget
                    ? 'border-green-500 bg-green-50 dark:bg-green-950'
                    : 'border-red-500 bg-red-50 dark:bg-red-950'
                  : 'border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800'
              }`}
            >
              <span className="font-kana block">{choice.kana}</span>
              {answered && (
                <span className="block text-sm font-normal text-neutral-500 dark:text-neutral-400">
                  {choice.romaji}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <AnswerFeedbackRow feedback={feedback} mood={mood} />

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
