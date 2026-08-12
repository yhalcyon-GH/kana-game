import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackToHubLink } from '../../components/BackToHubLink'
import { Mascot } from '../../components/Mascot'
import { PracticeSummary } from '../../components/PracticeSummary'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useTTS } from '../../hooks/useTTS'
import { isAnswerCorrect, normalizeKana, normalizeRomaji } from '../../lib/answerChecking'
import { isNearMissText } from '../../lib/answerCloseness'
import { buildWeightedQueue } from '../../lib/practiceSelection'
import { useProgressStore } from '../../store/progressStore'

const ROUNDS = 8

// Types a whole word — in kana OR romaji, either is accepted (see
// isAnswerCorrect) — from its audio/emoji/meaning prompt, instead of
// picking it out of multiple choice (see ListeningPage). Production recall
// is a meaningfully different, harder skill than recognition, and it's the
// single most-praised mechanic across competing kana apps.
export function KanaTypingPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady, getScopeWords } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const characters = useProgressStore((s) => s.characters)
  const { speak, supported } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
  const { feedback, mood, mistakes, mistakeIds, onCorrect, onWrong, onPerfect, clear, resetSession } = useAnswerFeedback()
  const inputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)

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
  const [input, setInput] = useState('')
  const [answered, setAnswered] = useState(false)
  const [wasCorrect, setWasCorrect] = useState(false)
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
    setInput('')
    setAnswered(false)
    setWasCorrect(false)
    clear()
    speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)
    inputRef.current?.focus()
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

  useEnterAdvance(answered && !wasCorrect, advance)

  const submit = () => {
    if (answered || !currentWord || input.trim() === '' || isComposingRef.current) return
    const isCorrect = isAnswerCorrect(input, currentWord)
    setAnswered(true)
    setWasCorrect(isCorrect)
    for (const charId of currentWord.characterIds) recordResult(charId, isCorrect)
    if (isCorrect) {
      setCorrectCount((c) => c + 1)
      onCorrect()
      setTimeout(advance, 900)
    } else {
      const isNearMiss =
        isNearMissText(normalizeKana(input), normalizeKana(currentWord.kana)) ||
        isNearMissText(normalizeRomaji(input), normalizeRomaji(currentWord.romaji))
      onWrong({ id: currentWord.id, kana: currentWord.kana, romaji: currentWord.romaji }, isNearMiss)
    }
  }

  if (!rowId || !isScopeReady(rowId)) return null
  if (scopeWords.length === 0) return null

  if (finished) {
    return (
      <PracticeSummary
        title="Kana Typing complete!"
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
      <div className="flex w-full items-center justify-between">
        <BackToHubLink rowId={rowId} />
        <Mascot mood={mood} />
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Round {roundIndex + 1} / {queue.length}
      </p>
      <div className="flex flex-col items-center gap-2">
        <img src={`${import.meta.env.BASE_URL}${currentWord.image}`} alt="" className="h-20 w-20" />
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

      {feedback && (
        <p className={`font-semibold ${feedback.ok ? 'text-red-500' : 'text-blue-500'}`}>
          {feedback.ok ? '○' : '✕'} {feedback.text}
        </p>
      )}

      {answered && !wasCorrect && (
        <>
          <p className="font-semibold text-neutral-500 dark:text-neutral-400">
            Answer: <span className="font-kana">{currentWord.kana}</span> ({currentWord.romaji})
          </p>
          <button
            type="button"
            onClick={advance}
            className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Next
          </button>
        </>
      )}
    </div>
  )
}
