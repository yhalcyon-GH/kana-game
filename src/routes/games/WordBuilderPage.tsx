import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { GameRoundHeader } from '../../components/GameRoundHeader'
import { KanaTile } from '../../components/KanaTile'
import { PracticeSummary } from '../../components/PracticeSummary'
import { RomajiToggle } from '../../components/RomajiToggle'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { ROWS_BY_ID } from '../../data/curriculum'
import type { AnchorWord } from '../../data/types'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useGameSession } from '../../hooks/useGameSession'
import { useTTS } from '../../hooks/useTTS'
import { isNearMissSequence } from '../../lib/answerCloseness'
import { pickDistractorCharIds } from '../../lib/distractorPicker'
import { shuffle } from '../../lib/shuffle'
import { useProgressStore } from '../../store/progressStore'

const DISTRACTOR_COUNT = 3

type TrayTile = { key: string; charId: string; placed: boolean }

export function WordBuilderPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady, getScopeCharacterIds, getScopeWords } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const characters = useProgressStore((s) => s.characters)
  const showRomaji = useProgressStore((s) => s.showRomaji)
  const { speak, supported } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
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
  } = useAnswerFeedback()
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined
  const scopeCharacterIds = useMemo(() => getScopeCharacterIds(rowId), [rowId, getScopeCharacterIds])

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId)) navigate('/', { replace: true })
  }, [rowId, isScopeReady, navigate])

  const scopeWords = useMemo(() => getScopeWords(rowId), [rowId, getScopeWords])
  const wordIds = useMemo(() => scopeWords.map((w) => w.id), [scopeWords])
  const wordsById = useMemo(() => Object.fromEntries(scopeWords.map((w) => [w.id, w])), [scopeWords])

  const wordWeight = useCallback(
    (wordId: string) => {
      const word = wordsById[wordId]
      if (!word) return 0
      return Math.min(...word.characterIds.map((c) => characters[c]?.box ?? 0))
    },
    [wordsById, characters],
  )

  const { queue, roundIndex, correctCount, setCorrectCount, finished, startSession, startMistakeReview, advance } =
    useGameSession({ ids: wordIds, weight: wordWeight, onFinish, resetSession })

  const [slots, setSlots] = useState<(string | null)[]>([])
  const [tray, setTray] = useState<TrayTile[]>([])
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing')

  // Sets up a fresh tray/slots for a new word.
  const setupRound = useCallback(
    (word: AnchorWord) => {
      const distractors = pickDistractorCharIds(word.characterIds, scopeCharacterIds, DISTRACTOR_COUNT)
      const tileIds = shuffle([...word.characterIds, ...distractors])
      setTray(tileIds.map((charId, i) => ({ key: `${charId}-${i}`, charId, placed: false })))
      setSlots(new Array(word.characterIds.length).fill(null))
      setStatus('playing')
      clear()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeCharacterIds],
  )

  useEffect(() => {
    if (queue.length === 0) return
    const word = wordsById[queue[roundIndex]]
    if (word) setupRound(word)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIndex, queue])

  const currentWord = queue.length > 0 ? wordsById[queue[roundIndex]] : undefined

  useEffect(() => {
    if (!currentWord) return
    speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord?.id])

  useEffect(() => {
    if (!currentWord || status !== 'playing') return
    if (slots.some((s) => s === null)) return

    const placedCharIds = slots.map((key) => tray.find((t) => t.key === key)?.charId)
    const isCorrect = placedCharIds.every((id, i) => id === currentWord.characterIds[i])
    for (const charId of currentWord.characterIds) recordResult(charId, isCorrect)

    if (isCorrect) {
      setStatus('correct')
      setCorrectCount((c) => c + 1)
      onCorrect()
      const timer = setTimeout(advance, 900)
      return () => clearTimeout(timer)
    }

    // One attempt per word — a miss reveals the answer and waits for the
    // learner to move on manually (see the "Next" button below), matching
    // how the other three games handle a wrong answer.
    setStatus('wrong')
    onWrong(
      { id: currentWord.id, kana: currentWord.kana, romaji: currentWord.romaji },
      isNearMissSequence(placedCharIds, currentWord.characterIds),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  useEnterAdvance(status === 'wrong', advance)

  const handleTrayClick = (tile: TrayTile) => {
    if (tile.placed || status !== 'playing') return
    const emptyIndex = slots.findIndex((s) => s === null)
    if (emptyIndex === -1) return
    setSlots((prev) => {
      const next = [...prev]
      next[emptyIndex] = tile.key
      return next
    })
    setTray((prev) => prev.map((t) => (t.key === tile.key ? { ...t, placed: true } : t)))
  }

  const handleSlotClick = (index: number) => {
    const key = slots[index]
    if (!key || status !== 'playing') return
    setSlots((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
    setTray((prev) => prev.map((t) => (t.key === key ? { ...t, placed: false } : t)))
  }

  if (!rowId || (!isReview && !row)) return null
  if (scopeWords.length === 0) return null

  if (finished) {
    return (
      <PracticeSummary
        title="Word Builder complete!"
        stats={[
          { label: 'Correct', value: `${correctCount} / ${queue.length}` },
          { label: 'Accuracy', value: `${Math.round((correctCount / queue.length) * 100)}%` },
        ]}
        backHref={isReview ? '/review' : `/practice/${rowId}`}
        onRetry={startSession}
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
      <GameRoundHeader rowId={rowId} roundIndex={roundIndex} total={queue.length} />
      <div className="flex flex-col items-center gap-2">
        <img src={`${import.meta.env.BASE_URL}${currentWord.image}`} alt="" className="h-20 w-20" />
        <span className="text-lg font-semibold">{currentWord.meaning}</span>
        <div className="flex items-center gap-2">
          {showRomaji && <span className="text-sm text-neutral-500 dark:text-neutral-400">{currentWord.romaji}</span>}
          <RomajiToggle />
        </div>
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

      <div className="flex gap-2">
        {slots.map((key, i) => {
          const tile = key ? tray.find((t) => t.key === key) : undefined
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSlotClick(i)}
              className="font-kana flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 text-2xl font-bold dark:border-neutral-600"
            >
              {tile ? CHARACTERS_BY_ID[tile.charId].kana : ''}
            </button>
          )
        })}
      </div>

      <AnswerFeedbackRow feedback={feedback} mood={mood} />

      {status === 'wrong' && (
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

      <div className="flex flex-wrap justify-center gap-2">
        {tray.map((tile) => (
          <KanaTile
            key={tile.key}
            kana={CHARACTERS_BY_ID[tile.charId].kana}
            disabled={tile.placed || status !== 'playing'}
            onClick={() => handleTrayClick(tile)}
          />
        ))}
      </div>
    </div>
  )
}
