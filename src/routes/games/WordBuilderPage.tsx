import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { AnswerReveal } from '../../components/AnswerReveal'
import { GameRoundHeader } from '../../components/GameRoundHeader'
import { KanaTile } from '../../components/KanaTile'
import { PracticeSummary } from '../../components/PracticeSummary'
import { ReviewEmptyState } from '../../components/ReviewEmptyState'
import { RomajiHint } from '../../components/RomajiHint'
import { WordImage } from '../../components/WordImage'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { getNextRowId, ROWS_BY_ID } from '../../data/curriculum'
import type { QuestionMode } from '../../data/feedback'
import type { AnchorWord } from '../../data/types'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useFrozenWordPool } from '../../hooks/useFrozenWordPool'
import { useGameSession } from '../../hooks/useGameSession'
import { useTTS } from '../../hooks/useTTS'
import { pickDistractorCharIds } from '../../lib/distractorPicker'
import { kanaToRomaji } from '../../lib/kanaToRomaji'
import { shuffle } from '../../lib/shuffle'
import { buildSimilarLettersWordQueue, pickSimilarLettersDistractorCharIds } from '../../lib/similarLettersSelection'
import { useProgressStore } from '../../store/progressStore'

const DISTRACTOR_COUNT = 3

// Tiles are one per learning-unit CHARACTER ID, not raw Unicode glyphs —
// most characters are 1 glyph already (charId and glyph coincide), but a
// 2-glyph character (yōon like きゃ, or Special Katakana like ファ — see
// characters.ts's "one glyph = one mora" note) is ONE tile showing both
// glyphs together, e.g. ティッシュ is built from [ティ][ッ][シュ], never
// split further into [テ][ィ][ッ][シ][ュ] — per the Special Katakana spec's
// explicit requirement (this reverses an earlier explicit request to split
// yōon into separate single-glyph tiles; the mora unit is now used
// everywhere, including existing yōon words).
type TrayTile = { key: string; glyph: string; placed: boolean }

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

  const [slots, setSlots] = useState<(string | null)[]>([])
  const [tray, setTray] = useState<TrayTile[]>([])
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing')
  // Per-question romaji hint (see RomajiHint) — reset every round in
  // setupRound below so revealing it never carries over to the next word.
  const [romajiHintShown, setRomajiHintShown] = useState(false)

  // Sets up a fresh tray/slots for a new word. Slots/tiles are sized to the
  // word's CHARACTER-ID (learning-unit/mora) count, not its raw Unicode
  // glyph count — see TrayTile's comment. A 2-glyph character (yōon like
  // きゃ, or Special Katakana like ファ — see tracingUnits.ts's identical
  // "one learning target = one mora" generalization) is ONE tile showing
  // both glyphs together, never split into two single-glyph tiles: the
  // learner places/reads it as the one unit it actually is.
  const setupRound = useCallback(
    (word: AnchorWord) => {
      const distractorCharIds = isSimilarLetters
        ? pickSimilarLettersDistractorCharIds(word.characterIds, confusionGroups, scopeCharacterIds, DISTRACTOR_COUNT)
        : pickDistractorCharIds(word.characterIds, scopeCharacterIds, DISTRACTOR_COUNT)
      const targetTiles = word.characterIds.map((id) => CHARACTERS_BY_ID[id]?.kana ?? '')
      const distractorTiles = distractorCharIds.map((id) => CHARACTERS_BY_ID[id]?.kana ?? '')
      const tileGlyphs = shuffle([...targetTiles, ...distractorTiles])
      setTray(tileGlyphs.map((glyph, i) => ({ key: `${glyph}-${i}`, glyph, placed: false })))
      setSlots(new Array(targetTiles.length).fill(null))
      setStatus('playing')
      setRomajiHintShown(false)
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
    // Keyed on roundIndex too, not just currentWord.id — a small pool can
    // put the same word in consecutive rounds, and it should still
    // announce itself each round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord?.id, roundIndex])

  useEffect(() => {
    if (!currentWord || status !== 'playing') return
    if (slots.some((s) => s === null)) return

    const placedTiles = slots.map((key) => tray.find((t) => t.key === key)?.glyph)
    const targetTiles = currentWord.characterIds.map((id) => CHARACTERS_BY_ID[id]?.kana ?? '')
    const isCorrect = placedTiles.every((tile, i) => tile === targetTiles[i])

    // Record each character's OWN correctness, not the whole word's — a
    // wrong tile anywhere used to mark EVERY character in the word wrong,
    // including ones the learner placed correctly. That was harmless back
    // when it only fed the SRS box, but now directly drives character
    // Review (see lib/srs.ts's applyReviewResult), so a misattributed
    // character would show up there as "kept missing" when it wasn't the
    // problem. Each tile is exactly one character's own mora now (see
    // setupRound above), so this is a direct 1:1 walk — no glyph-span
    // accounting needed. Word Builder has real per-character precision, so
    // ONLY the actually-wrong character(s) enter Review here — a correctly
    // placed character that wasn't already active stays untouched
    // (recordCharacterReviewResult is a no-op for a correct, inactive item).
    currentWord.characterIds.forEach((charId, i) => {
      const charCorrect = placedTiles[i] === targetTiles[i]
      recordResult(charId, charCorrect)
      recordCharacterReviewResult(charId, charCorrect)
    })
    recordWordReviewResult(currentWord.id, isCorrect)

    if (isCorrect) {
      setStatus('correct')
      setCorrectCount((c) => c + 1)
      onCorrect()
      const timer = setTimeout(advance, 2000)
      return () => clearTimeout(timer)
    }

    // One attempt per word — a miss reveals the answer and waits for the
    // learner to move on manually (see the "Next" button below), matching
    // how the other three games handle a wrong answer.
    setStatus('wrong')
    onWrong({ id: currentWord.id, kana: currentWord.kana, romaji: currentWord.romaji })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  useEnterAdvance(status === 'wrong', advance)

  // Recommended Path completion — see KanaQuizPage's identical comment.
  // Word Builder is the FINAL core activity, so this also completes the
  // row's whole Recommended Path (see PracticeSummary's continueAction
  // below, and PracticeHubPage's "Lesson complete" state). Similar Letters
  // is a supplementary comparison lesson on a synthetic row, never part of
  // Recommended Path (see PracticeHubPage's showRecommendedPath) — it must
  // not write a completion record for that synthetic row id either.
  useEffect(() => {
    if (finished && !isReview && !isSimilarLetters && rowId) markRowActivityCompleted(rowId, 'wordBuilder')
  }, [finished, isReview, isSimilarLetters, rowId, markRowActivityCompleted])

  // Next Row for the Word Builder summary's Continue action — omitted
  // entirely (no continueAction passed) when there's no next row, rather
  // than rendering a broken link. Uses the existing getNextRowId helper
  // instead of duplicating row-ordering logic.
  const nextRowId = !isReview && rowId ? getNextRowId(rowId) : null
  const nextRowCategoryId = nextRowId ? ROWS_BY_ID[nextRowId]?.categoryId : undefined

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
  // Not a plain "scopeWords.length === 0 -> empty state": that pool is LIVE
  // and can legitimately drop to 0 mid-session (every queued word graduates
  // during play) while the frozen session queue still has an in-progress
  // round to show — see ListeningPage's identical comment.
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
        continueAction={
          !isReview && nextRowId && nextRowCategoryId
            ? { label: 'Continue → Next Row', to: `/practice/${nextRowCategoryId}/${nextRowId}` }
            : undefined
        }
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
        {status === 'playing' && (
          <RomajiHint
            romaji={currentWord.romaji}
            alwaysShow={alwaysShowRomajiHints}
            revealed={romajiHintShown}
            onReveal={() => setRomajiHintShown(true)}
          />
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

      <div className="flex gap-2">
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
              {status !== 'playing' && tile && (
                <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
                  {kanaToRomaji(tile.glyph)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <AnswerFeedbackRow
        mood={mood}
        left={status === 'wrong' && <AnswerReveal characterIds={currentWord.characterIds} />}
      />

      {status === 'wrong' && (
        <button
          type="button"
          onClick={advance}
          className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Next
        </button>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {tray.map((tile) => (
          <KanaTile
            key={tile.key}
            kana={tile.glyph}
            disabled={tile.placed || status !== 'playing'}
            onClick={() => handleTrayClick(tile)}
          />
        ))}
      </div>
    </div>
  )
}
