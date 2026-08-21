import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { AnswerReveal } from '../../components/AnswerReveal'
import { GameRoundHeader } from '../../components/GameRoundHeader'
import { PracticeSummary } from '../../components/PracticeSummary'
import { WordImage } from '../../components/WordImage'
import { ROWS_BY_ID } from '../../data/curriculum'
import type { QuestionMode } from '../../data/feedback'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useDelayedAction } from '../../hooks/useDelayedAction'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useFrozenWordPool } from '../../hooks/useFrozenWordPool'
import { useGameSession } from '../../hooks/useGameSession'
import { useTTS } from '../../hooks/useTTS'
import { isAnswerCorrect } from '../../lib/answerChecking'
import { REVIEW_SCORE_HIT_IMPRECISE, REVIEW_SCORE_HIT_WORD, REVIEW_SCORE_MISS_IMPRECISE, REVIEW_SCORE_MISS_WORD } from '../../lib/srs'
import { useProgressStore } from '../../store/progressStore'

// Types a whole word — in hiragana, katakana, OR romaji, any of the three
// is accepted regardless of which script the word is actually printed in
// (see isAnswerCorrect) — from its audio/emoji/meaning prompt, instead of
// picking it out of multiple choice (see ListeningPage). Production recall
// is a meaningfully different, harder skill than recognition, and it's the
// single most-praised mechanic across competing kana apps.
type Props = {
  // Set only by the /practice/review/kana-typing route — see REVIEW_SCOPE_ID.
  rowIdOverride?: string
}

export function KanaTypingPage({ rowIdOverride }: Props = {}) {
  const params = useParams<{ categoryId?: string; rowId?: string }>()
  const rowId = rowIdOverride ?? params.rowId
  const navigate = useNavigate()
  const { isScopeReady, getScopeWords, getScopeRounds } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const adjustCharacterReviewScore = useProgressStore((s) => s.adjustCharacterReviewScore)
  const adjustWordReviewScore = useProgressStore((s) => s.adjustWordReviewScore)
  const characters = useProgressStore((s) => s.characters)
  const { speak, supported } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
  const categoryId = isReview ? undefined : (params.categoryId ?? ROWS_BY_ID[rowId ?? '']?.categoryId)
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
  const inputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId) || (!isReview && ROWS_BY_ID[rowId]?.categoryId !== categoryId)) {
      navigate('/', { replace: true })
    }
  }, [rowId, isReview, categoryId, isScopeReady, navigate])

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

  const [input, setInput] = useState('')
  const [answered, setAnswered] = useState(false)
  const [wasCorrect, setWasCorrect] = useState(false)

  const currentWord = queue.length > 0 ? wordsById[queue[roundIndex]] : undefined

  useEffect(() => {
    if (!currentWord) return
    setInput('')
    setAnswered(false)
    setWasCorrect(false)
    clear()
    speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)
    inputRef.current?.focus()
    // Keyed on roundIndex too, not just currentWord.id — a small pool (e.g.
    // Review with only 1-2 weak words) can put the same word in
    // consecutive rounds, and this effect must still reset per-round state
    // even when the id doesn't change, or the next round renders already
    // "answered" from the previous one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord?.id, roundIndex])

  useEnterAdvance(answered && !wasCorrect, advance)

  const submit = () => {
    if (answered || !currentWord || input.trim() === '' || isComposingRef.current) return
    const isCorrect = isAnswerCorrect(input, currentWord)
    setAnswered(true)
    setWasCorrect(isCorrect)
    // Kana Typing only knows the WHOLE word was right or wrong, not which
    // glyph was the actual mistake — every character in the word gets the
    // same smaller "imprecise" review-score step (see lib/srs.ts).
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

  if (!rowId || !isScopeReady(rowId)) return null
  if (scopeWords.length === 0) return null

  if (finished) {
    return (
      <PracticeSummary
        title="Kana Typing complete!"
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
        <span className="text-lg font-semibold">{currentWord.meaning}</span>
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

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onClick={() => inputRef.current?.focus()}
        className="flex flex-col items-center gap-3"
      >
        <input
          ref={inputRef}
          type="text"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={input}
          disabled={answered}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false
          }}
          placeholder="かな or romaji…"
          className={`w-56 rounded-xl border-2 px-4 py-3 text-center text-2xl font-bold focus:outline-none ${
            answered
              ? wasCorrect
                ? 'border-green-500 bg-green-50 dark:bg-green-950'
                : 'border-red-500 bg-red-50 dark:bg-red-950'
              : 'border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800'
          }`}
        />
        {!answered && (
          <button
            type="submit"
            disabled={input.trim() === ''}
            className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Check
          </button>
        )}
      </form>

      <AnswerFeedbackRow
        feedback={feedback}
        mood={mood}
        left={answered && !wasCorrect && <AnswerReveal characterIds={currentWord.characterIds} />}
      />

      {answered && !wasCorrect && (
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
