import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { AnswerReveal } from '../../components/AnswerReveal'
import { GameRoundHeader } from '../../components/GameRoundHeader'
import { KanaTile } from '../../components/KanaTile'
import { PracticeSummary } from '../../components/PracticeSummary'
import { ReviewEmptyState } from '../../components/ReviewEmptyState'
import { SaveWordToggle } from '../../components/SaveWordToggle'
import { WordImage } from '../../components/WordImage'
import { getNextRowId, ROWS_BY_ID } from '../../data/curriculum'
import type { QuestionMode } from '../../data/feedback'
import { PRACTICE_CHECKPOINTS } from '../../data/practiceCheckpoints'
import type { AnchorWord } from '../../data/types'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useDelayedAction } from '../../hooks/useDelayedAction'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useFrozenWordPool } from '../../hooks/useFrozenWordPool'
import { useGameSession } from '../../hooks/useGameSession'
import { usePracticeAnalytics } from '../../hooks/usePracticeAnalytics'
import { useTTS } from '../../hooks/useTTS'
import { pickDistractorCharIds } from '../../lib/distractorPicker'
import { kanaToRomaji } from '../../lib/kanaToRomaji'
import { shuffle } from '../../lib/shuffle'
import { buildSimilarLettersWordQueue, pickSimilarLettersDistractorCharIds } from '../../lib/similarLettersSelection'
import { isNearMissWordBuilder } from '../../lib/nearMiss'
import { buildFlatTargetTiles, displayGlyphsForCharId, type FlatTargetTile } from '../../lib/wordBuilderTiles'
import { removeWordBuilderSlot, toggleWordBuilderTrayTile, type WordBuilderTrayTile } from '../../lib/wordBuilderPlacement'
import { useProgressStore } from '../../store/progressStore'

const DISTRACTOR_COUNT = 3


type Props = {
  // Set only by the /practice/review/word-builder route — see REVIEW_SCOPE_ID.
  rowIdOverride?: string
}

export function WordBuilderPage({ rowIdOverride }: Props = {}) {
  const params = useParams<{ categoryId?: string; rowId?: string }>()
  const rowId = rowIdOverride ?? params.rowId
  const navigate = useNavigate()
  const { isScopeReady, getScopeCharacterIds, getScopeWords, getScopeRounds, isSimilarLettersRow, getConfusionGroups } =
    useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const recordCharacterReviewResult = useProgressStore((s) => s.recordCharacterReviewResult)
  const recordWordReviewResult = useProgressStore((s) => s.recordWordReviewResult)
  const markRowActivityCompleted = useProgressStore((s) => s.markRowActivityCompleted)
  const characters = useProgressStore((s) => s.characters)
  const alwaysShowRomajiHints = useProgressStore((s) => s.alwaysShowRomajiHints)
  const { speak, supported } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
  const rounds = getScopeRounds(rowId)
  const {
    mood,
    mistakes,
    mistakeIds,
    onCorrect,
    onWrong,
    onFinish,
    clear,
    resetSession,
  } = useAnswerFeedback(rounds as QuestionMode)
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined
  const categoryId = isReview ? undefined : (params.categoryId ?? row?.categoryId)
  const scopeCharacterIds = useMemo(() => getScopeCharacterIds(rowId), [rowId, getScopeCharacterIds])

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

  // Similar Letters mode (see similarLettersSelection.ts) — same 80/20
  // group-balanced word queue as ListeningPage.
  const isSimilarLetters = isSimilarLettersRow(rowId)
  const confusionGroups = useMemo(() => getConfusionGroups(rowId), [rowId, getConfusionGroups])
  const buildQueue = useMemo(() => {
    if (!isSimilarLetters) return undefined
    const targetIds = new Set(confusionGroups.flat())
    const targetWords = scopeWords.filter((w) => w.characterIds.some((id) => targetIds.has(id)))
    const normalWords = scopeWords.filter((w) => !w.characterIds.some((id) => targetIds.has(id)))
    return () => buildSimilarLettersWordQueue(confusionGroups, targetWords, normalWords, rounds)
  }, [isSimilarLetters, confusionGroups, scopeWords, rounds])

  const { queue, roundIndex, correctCount, setCorrectCount, finished, startMistakeReview, advance } =
    useGameSession({ ids: wordIds, weight: wordWeight, onFinish, resetSession, rounds, sessionKey, buildQueue })
  usePracticeAnalytics('wordBuilder', categoryId, isReview || isSimilarLetters ? undefined : rowId, sessionKey, finished, correctCount, queue.length)
  const { schedule: scheduleAdvance, cancel: cancelAdvance } = useDelayedAction()
  const handleNext = useCallback(() => {
    cancelAdvance()
    advance()
  }, [cancelAdvance, advance])

  const [slots, setSlots] = useState<(string | null)[]>([])
  const [tray, setTray] = useState<WordBuilderTrayTile[]>([])
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing')
  const [resultRecorded, setResultRecorded] = useState(false)
  const [targetTiles, setTargetTiles] = useState<FlatTargetTile[]>([])

  const setupRound = useCallback(
    (word: AnchorWord) => {
      const distractorCharIds = isSimilarLetters
        ? pickSimilarLettersDistractorCharIds(word.characterIds, confusionGroups, scopeCharacterIds, DISTRACTOR_COUNT)
        : pickDistractorCharIds(word.characterIds, scopeCharacterIds, DISTRACTOR_COUNT)
      const flatTarget = buildFlatTargetTiles(word.characterIds)
      const distractorTiles = distractorCharIds.flatMap((id) => displayGlyphsForCharId(id))
      const tileGlyphs = shuffle([...flatTarget.map((t) => t.glyph), ...distractorTiles])
      setTray(tileGlyphs.map((glyph, i) => ({ key: `${glyph}-${i}`, glyph, placed: false })))
      setTargetTiles(flatTarget)
      setSlots(new Array(flatTarget.length).fill(null))
      setStatus('playing')
      setResultRecorded(false)
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
  }, [currentWord?.id, roundIndex])

  useEffect(() => {
    if (!currentWord || resultRecorded) return
    if (slots.some((s) => s === null)) return
    setResultRecorded(true)

    const placedGlyphs = slots.map((key) => tray.find((t) => t.key === key)?.glyph)
    const isCorrect = placedGlyphs.every((glyph, i) => glyph === targetTiles[i]?.glyph)

    const charIdOrder: string[] = []
    const charIdCorrect = new Map<string, boolean>()
    targetTiles.forEach((target, i) => {
      const partCorrect = placedGlyphs[i] === target.glyph
      if (!charIdCorrect.has(target.charId)) {
        charIdCorrect.set(target.charId, true)
        charIdOrder.push(target.charId)
      }
      if (!partCorrect) charIdCorrect.set(target.charId, false)
    })
    charIdOrder.forEach((charId) => {
      const charCorrect = charIdCorrect.get(charId) ?? false
      recordResult(charId, charCorrect)
      recordCharacterReviewResult(charId, charCorrect)
    })
    recordWordReviewResult(currentWord.id, isCorrect)

    if (isCorrect) {
      setStatus('correct')
      setCorrectCount((c) => c + 1)
      onCorrect()
      scheduleAdvance(advance, 2000)
      return
    }

    setStatus('wrong')
    const wrongUnitCount = charIdOrder.filter((id) => !charIdCorrect.get(id)).length
    onWrong(
      { id: currentWord.id, kana: currentWord.kana, romaji: currentWord.romaji },
      isNearMissWordBuilder(wrongUnitCount, charIdOrder.length),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  useEnterAdvance(status === 'wrong', advance)

  // Word Builder completes its own Recommended step as before. For rows with
  // an approved Restaurant/Cafe checkpoint, Recommended then advances to
  // that real-life step rather than directly to the next row.
  useEffect(() => {
    if (finished && !isReview && !isSimilarLetters && rowId) markRowActivityCompleted(rowId, 'wordBuilder')
  }, [finished, isReview, isSimilarLetters, rowId, markRowActivityCompleted])

  const checkpoint = !isReview && rowId ? PRACTICE_CHECKPOINTS.find((item) => item.afterRowId === rowId) : undefined
  const nextRowId = !isReview && rowId ? getNextRowId(rowId) : null
  const nextRowCategoryId = nextRowId ? ROWS_BY_ID[nextRowId]?.categoryId : undefined
  const continueAction = checkpoint
    ? {
        label: checkpoint.mode === 'cafe' ? 'Continue → Cafe' : 'Continue → Restaurant',
        to: checkpoint.routePath,
      }
    : !isReview && nextRowId && nextRowCategoryId
      ? { label: 'Continue → Next Row', to: `/practice/${nextRowCategoryId}/${nextRowId}` }
      : undefined

  const handleTrayClick = (tile: WordBuilderTrayTile) => {
    if (status === 'correct') return
    const next = toggleWordBuilderTrayTile({ slots, tray }, tile.key)
    setSlots(next.slots)
    setTray(next.tray)
  }

  const handleSlotClick = (index: number) => {
    if (status === 'correct') return
    const next = removeWordBuilderSlot({ slots, tray }, index)
    setSlots(next.slots)
    setTray(next.tray)
  }

  if (!rowId || (!isReview && !row)) return null
  if (scopeWords.length === 0 && queue.length === 0) return isReview ? <ReviewEmptyState /> : null

  if (finished) {
    return (
      <PracticeSummary
        title="Word Builder complete!"
        score={{ correct: correctCount, total: queue.length }}
        backHref={isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`}
        onRetry={() => setSessionAttempt((attempt) => attempt + 1)}
        mistakes={mistakes}
        onRetryMistakes={() => startMistakeReview(mistakeIds)}
        continueAction={!isReview ? continueAction : undefined}
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
        {status === 'playing' && alwaysShowRomajiHints && (
          <span className="text-sm text-neutral-500 dark:text-neutral-400">{currentWord.romaji}</span>
        )}
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

      <div className="flex max-w-full flex-wrap justify-center gap-2">
        {slots.map((key, i) => {
          const tile = key ? tray.find((t) => t.key === key) : undefined
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSlotClick(i)}
              className="flex h-14 w-14 flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-600"
            >
              <span className={`font-kana font-bold whitespace-nowrap ${tile && [...tile.glyph].length > 1 ? 'text-base' : 'text-2xl'}`}>
                {tile ? tile.glyph : ''}
              </span>
              <span
                className={`text-xs font-normal text-neutral-500 dark:text-neutral-400 ${
                  status !== 'playing' && tile ? 'visible' : 'invisible'
                }`}
                aria-hidden={!(status !== 'playing' && tile)}
              >
                {tile ? kanaToRomaji(tile.glyph) : ' '}
              </span>
            </button>
          )
        })}
      </div>

      <div className="min-h-[3.5rem] flex items-center justify-center" aria-hidden={status !== 'wrong'}>
        {status === 'wrong' && <AnswerReveal characterIds={currentWord.characterIds} />}
      </div>

      <AnswerFeedbackRow
        mood={mood}
        showNext={status === 'correct' || status === 'wrong'}
        onNext={handleNext}
        saveControl={status === 'wrong' ? <SaveWordToggle wordId={currentWord.id} kana={currentWord.kana} /> : undefined}
      />

      <div className="flex flex-wrap justify-center gap-2">
        {tray.map((tile) => (
          <KanaTile
            key={tile.key}
            kana={tile.glyph}
            disabled={status === 'correct'}
            pressed={tile.placed}
            onClick={() => handleTrayClick(tile)}
          />
        ))}
      </div>
    </div>
  )
}
