import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { KanaTile } from '../../components/KanaTile'
import { PracticeSummary } from '../../components/PracticeSummary'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { ROWS_BY_ID } from '../../data/curriculum'
import type { AnchorWord } from '../../data/types'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useTTS } from '../../hooks/useTTS'
import { pickDistractorCharIds } from '../../lib/distractorPicker'
import { buildWeightedQueue } from '../../lib/practiceSelection'
import { shuffle } from '../../lib/shuffle'
import { useProgressStore } from '../../store/progressStore'

const ROUNDS = 8
const DISTRACTOR_COUNT = 3

type TrayTile = { key: string; charId: string; placed: boolean }

export function WordBuilderPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady, getScopeCharacterIds, getScopeWords } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const characters = useProgressStore((s) => s.characters)
  const { speak } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined
  const scopeCharacterIds = useMemo(() => getScopeCharacterIds(rowId), [rowId, getScopeCharacterIds])

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
  const [roundAttempts, setRoundAttempts] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)
  const [slots, setSlots] = useState<(string | null)[]>([])
  const [tray, setTray] = useState<TrayTile[]>([])
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing')

  const startSession = useCallback(() => {
    const wordIds = scopeWords.map((w) => w.id)
    setQueue(buildWeightedQueue(wordIds, wordWeight, Math.min(ROUNDS, wordIds.length * 3)))
    setRoundIndex(0)
    setCorrectCount(0)
    setFinished(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeWords])

  useEffect(() => {
    if (scopeWords.length > 0) startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeWords.length])

  // Rebuilds the tray/slots for `word` without touching roundAttempts —
  // used for a same-word retry, so a second wrong attempt doesn't get
  // treated as a fresh "first attempt" and double up on penalties.
  const resetTray = useCallback(
    (word: AnchorWord) => {
      const distractors = pickDistractorCharIds(word.characterIds, scopeCharacterIds, DISTRACTOR_COUNT)
      const tileIds = shuffle([...word.characterIds, ...distractors])
      setTray(tileIds.map((charId, i) => ({ key: `${charId}-${i}`, charId, placed: false })))
      setSlots(new Array(word.characterIds.length).fill(null))
      setStatus('playing')
    },
    [scopeCharacterIds],
  )

  // Starts a brand-new word: same as resetTray, plus clears roundAttempts.
  const setupRound = useCallback(
    (word: AnchorWord) => {
      resetTray(word)
      setRoundAttempts(0)
    },
    [resetTray],
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

  const advance = useCallback(() => {
    if (roundIndex + 1 >= queue.length) {
      setFinished(true)
    } else {
      setRoundIndex((i) => i + 1)
    }
  }, [roundIndex, queue.length])

  useEffect(() => {
    if (!currentWord || status !== 'playing') return
    if (slots.some((s) => s === null)) return

    const placedCharIds = slots.map((key) => tray.find((t) => t.key === key)?.charId)
    const isCorrect = placedCharIds.every((id, i) => id === currentWord.characterIds[i])

    if (isCorrect) {
      // Every successful completion reinforces the characters, regardless
      // of how many attempts it took.
      for (const charId of currentWord.characterIds) recordResult(charId, true)
      setStatus('correct')
      setCorrectCount((c) => c + 1)
      const timer = setTimeout(advance, 900)
      return () => clearTimeout(timer)
    }

    // Only the first miss on this word counts as a negative signal —
    // retries after a hint shouldn't keep dragging the box down.
    if (roundAttempts === 0) {
      for (const charId of currentWord.characterIds) recordResult(charId, false)
    }
    setStatus('wrong')
    setRoundAttempts((a) => a + 1)
    const timer = setTimeout(() => resetTray(currentWord), 900)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

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
      />
    )
  }

  if (!currentWord) return null

  const hintActive = roundAttempts >= 2 && status === 'playing'
  const nextSlotIndex = slots.findIndex((s) => s === null)
  const hintCharId = hintActive && nextSlotIndex !== -1 ? currentWord.characterIds[nextSlotIndex] : null

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Round {roundIndex + 1} / {queue.length}
      </p>
      <div className="flex flex-col items-center gap-2">
        <span className="text-5xl">{currentWord.emoji}</span>
        <span className="text-lg font-semibold">{currentWord.meaning}</span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{currentWord.romaji}</span>
      </div>

      <div className="flex gap-2">
        {slots.map((key, i) => {
          const tile = key ? tray.find((t) => t.key === key) : undefined
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSlotClick(i)}
              className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 text-2xl font-bold dark:border-neutral-600"
            >
              {tile ? CHARACTERS_BY_ID[tile.charId].kana : ''}
            </button>
          )
        })}
      </div>

      {status === 'wrong' && <p className="font-semibold text-red-500">Not quite — try again!</p>}
      {status === 'correct' && <p className="font-semibold text-green-500">Nice!</p>}

      <div className="flex flex-wrap justify-center gap-2">
        {tray.map((tile) => (
          <KanaTile
            key={tile.key}
            kana={CHARACTERS_BY_ID[tile.charId].kana}
            disabled={tile.placed}
            selected={hintCharId === tile.charId && !tile.placed}
            onClick={() => handleTrayClick(tile)}
          />
        ))}
      </div>
    </div>
  )
}
