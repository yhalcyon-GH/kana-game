import { useEffect, useRef, useState } from 'react'
import { AnswerReveal } from '../../../components/AnswerReveal'
import { KanaTile } from '../../../components/KanaTile'
import { WordImage } from '../../../components/WordImage'
import type { AnchorWord } from '../../../data/types'
import { useTTS } from '../../../hooks/useTTS'
import type { WordBuilderAssessmentQuestion } from '../../../lib/assessment/types'
import { shuffle } from '../../../lib/shuffle'
import { buildFlatTargetTiles, displayGlyphsForCharId, type FlatTargetTile } from '../../../lib/wordBuilderTiles'

type Props = {
  question: WordBuilderAssessmentQuestion
  wordsById: Record<string, AnchorWord>
  onAnswer: (correct: boolean) => void
}

type TrayTile = { key: string; glyph: string; placed: boolean }

// Assessment analogue of WordBuilderPage's tile-construction game (Issue
// #189), reusing the same tile-building/distractor logic. Assessment mode
// differs from normal Word Builder Practice deliberately: the vocabulary
// image, English meaning, and romaji all stay hidden until the learner
// answers — normal Word Builder Practice shows image/meaning unconditionally
// and is left untouched.
export function AssessmentWordBuilderQuestion({ question, wordsById, onAnswer }: Props) {
  const { speak, supported } = useTTS()
  const targetWord = wordsById[question.targetWordId]
  const [slots, setSlots] = useState<(string | null)[]>([])
  const [tray, setTray] = useState<TrayTile[]>([])
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing')
  const [targetTiles, setTargetTiles] = useState<FlatTargetTile[]>([])
  const answeredRef = useRef(false)

  useEffect(() => {
    if (!targetWord) return
    const flatTarget = buildFlatTargetTiles(targetWord.characterIds)
    const distractorTiles = question.distractorCharIds.flatMap((id) => displayGlyphsForCharId(id))
    const tileGlyphs = shuffle([...flatTarget.map((t) => t.glyph), ...distractorTiles])
    setTray(tileGlyphs.map((glyph, i) => ({ key: `${glyph}-${i}`, glyph, placed: false })))
    setTargetTiles(flatTarget)
    setSlots(new Array(flatTarget.length).fill(null))
    setStatus('playing')
    answeredRef.current = false
    speak(`words/${targetWord.id}`, targetWord.audioText ?? targetWord.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id])

  useEffect(() => {
    if (!targetWord || status !== 'playing' || slots.length === 0) return
    if (slots.some((s) => s === null)) return
    const placedGlyphs = slots.map((key) => tray.find((t) => t.key === key)?.glyph)
    const isCorrect = placedGlyphs.every((glyph, i) => glyph === targetTiles[i]?.glyph)
    setStatus(isCorrect ? 'correct' : 'wrong')
    if (!answeredRef.current) {
      answeredRef.current = true
      onAnswer(isCorrect)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  if (!targetWord) return null

  function handleTrayClick(tile: TrayTile) {
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

  function handleSlotClick(index: number) {
    const key = slots[index]
    if (!key || status !== 'playing') return
    setSlots((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
    setTray((prev) => prev.map((t) => (t.key === key ? { ...t, placed: false } : t)))
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        {/* Assessment mode: image/meaning stay hidden until answered — see
            this file's top comment. */}
        {status !== 'playing' && (
          <>
            <WordImage word={targetWord} className="h-20 w-20" />
            <span className="text-lg font-semibold">{targetWord.meaning}</span>
          </>
        )}
        {supported && (
          <button
            type="button"
            onClick={() => speak(`words/${targetWord.id}`, targetWord.audioText ?? targetWord.kana)}
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
              className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-600"
            >
              <span className={`font-kana font-bold whitespace-nowrap ${tile && [...tile.glyph].length > 1 ? 'text-base' : 'text-2xl'}`}>
                {tile ? tile.glyph : ''}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex min-h-[3.5rem] items-center justify-center" aria-hidden={status !== 'wrong'}>
        {status === 'wrong' && <AnswerReveal characterIds={targetWord.characterIds} />}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {tray.map((tile) => (
          <KanaTile key={tile.key} kana={tile.glyph} disabled={tile.placed || status !== 'playing'} onClick={() => handleTrayClick(tile)} />
        ))}
      </div>
    </div>
  )
}
