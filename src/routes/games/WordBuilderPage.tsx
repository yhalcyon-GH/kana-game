import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { GameRoundHeader } from '../../components/GameRoundHeader'
import { KanaTile } from '../../components/KanaTile'
import { PracticeSummary } from '../../components/PracticeSummary'
import { RomajiToggle } from '../../components/RomajiToggle'
import { WordImage } from '../../components/WordImage'
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

// Tiles are single KANA GLYPHS, not characterIds — most characters are 1
// glyph already (charId and glyph coincide), but a yōon character like きゃ
// is 2 glyphs/1 character id (see characters.ts's "one glyph = one mora"
// note), and the learner should place き and ゃ as two separate tiles here
// rather than one pre-combined きゃ tile, per the user's explicit request.
type TrayTile = { key: string; glyph: string; placed: boolean }

type Props = {
  // Set only by the /practice/review/word-builder route — see REVIEW_SCOPE_ID.
  rowIdOverride?: string
}

export function WordBuilderPage({ rowIdOverride }: Props = {}) {
  const params = useParams<{ categoryId?: string; rowId?: string }>()
  const rowId = rowIdOverride ?? params.rowId
  const navigate = useNavigate()
  const { isScopeReady, getScopeCharacterIds, getScopeWords, getScopeRounds } = useCurriculum()
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
  const categoryId = isReview ? undefined : (params.categoryId ?? row?.categoryId)
  const scopeCharacterIds = useMemo(() => getScopeCharacterIds(rowId), [rowId, getScopeCharacterIds])

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId) || (!isReview && row?.categoryId !== categoryId)) {
      navigate('/', { replace: true })
    }
  }, [rowId, isReview, row, categoryId, isScopeReady, navigate])

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
    useGameSession({ ids: wordIds, weight: wordWeight, onFinish, resetSession, rounds: getScopeRounds(rowId) })

  const [slots, setSlots] = useState<(string | null)[]>([])
  const [tray, setTray] = useState<TrayTile[]>([])
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing')

  // Sets up a fresh tray/slots for a new word. Slots are sized to the word's
  // GLYPH count (word.kana), not its characterId count — see TrayTile's
  // comment. Distractor characters are also split into their own glyphs, so
  // every tray tile is uniformly a single kana glyph regardless of whether
  // it came from a 1-glyph or 2-glyph source character.
  const setupRound = useCallback(
    (word: AnchorWord) => {
      const distractorCharIds = pickDistractorCharIds(word.characterIds, scopeCharacterIds, DISTRACTOR_COUNT)
      const targetGlyphs = [...word.kana]
      const distractorGlyphs = distractorCharIds.flatMap((id) => [...(CHARACTERS_BY_ID[id]?.kana ?? '')])
      const tileGlyphs = shuffle([...targetGlyphs, ...distractorGlyphs])
      setTray(tileGlyphs.map((glyph, i) => ({ key: `${glyph}-${i}`, glyph, placed: false })))
      setSlots(new Array(targetGlyphs.length).fill(null))
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

    const placedGlyphs = slots.map((key) => tray.find((t) => t.key === key)?.glyph)
    const targetGlyphs = [...currentWord.kana]
    const isCorrect = placedGlyphs.every((glyph, i) => glyph === targetGlyphs[i])

    // Record each character's OWN correctness, not the whole word's — a
    // wrong glyph anywhere used to mark EVERY character in the word wrong,
    // including ones the learner placed correctly. That was harmless back
    // when it only fed the SRS box, but now directly drives Review's Weak
    // Kana list (see lib/srs.ts's isWeak), so a misattributed character
    // would show up there as "kept missing" when it wasn't the problem.
    // Walk characterIds consuming each one's own glyph span (most are 1
    // glyph; yōon like きゃ is 2) rather than assuming a 1:1 index with
    // targetGlyphs.
    let glyphOffset = 0
    for (const charId of currentWord.characterIds) {
      const glyphSpan = CHARACTERS_BY_ID[charId]?.kana.length ?? 1
      let charCorrect = true
      for (let i = 0; i < glyphSpan; i++) {
        if (placedGlyphs[glyphOffset + i] !== targetGlyphs[glyphOffset + i]) charCorrect = false
      }
      recordResult(charId, charCorrect)
      glyphOffset += glyphSpan
    }

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
    onWrong(
      { id: currentWord.id, kana: currentWord.kana, romaji: currentWord.romaji },
      isNearMissSequence(placedGlyphs, targetGlyphs),
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
        backHref={isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`}
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
      <GameRoundHeader rowId={rowId} categoryId={categoryId} roundIndex={roundIndex} total={queue.length} />
      <div className="flex flex-col items-center gap-2">
        <WordImage word={currentWord} className="h-20 w-20" />
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
              {tile ? tile.glyph : ''}
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
            kana={tile.glyph}
            disabled={tile.placed || status !== 'playing'}
            onClick={() => handleTrayClick(tile)}
          />
        ))}
      </div>
    </div>
  )
}
