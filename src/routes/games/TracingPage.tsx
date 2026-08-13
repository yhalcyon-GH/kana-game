import type { PointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackToHubLink } from '../../components/BackToHubLink'
import { PracticeSummary } from '../../components/PracticeSummary'
import { StrokeOrderAnimation } from '../../components/StrokeOrderAnimation'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useTTS } from '../../hooks/useTTS'

const CANVAS_SIZE = 280 // CSS pixels, single-character phase
const WORD_CHAR_SIZE = 130 // CSS pixels per character, word phase

// Free-form tracing practice: draw over a faint guide of the kana with a
// finger/mouse/stylus. Deliberately NOT graded — competing apps' handwriting
// recognition is the single most complained-about mechanic in that space
// (too strict, frequent false rejections), so this is muscle-memory
// practice, not a test. No SRS interaction; nothing here is scored.
//
// Two phases: every character on its own (as before), then every word from
// this row spelled out in one continuous guide — carrying single-character
// stroke order into the multi-character rhythm of actually writing a word.
export function TracingPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady, getScopeQuizCharacterIds, getScopeWords } = useCurriculum()
  const { speak, supported } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId)) navigate('/', { replace: true })
  }, [rowId, isScopeReady, navigate])

  const charPool = useMemo(() => getScopeQuizCharacterIds(rowId), [rowId, getScopeQuizCharacterIds])
  const words = useMemo(() => getScopeWords(rowId), [rowId, getScopeWords])
  const wordIds = useMemo(() => words.map((w) => w.id), [words])
  const wordsById = useMemo(() => Object.fromEntries(words.map((w) => [w.id, w])), [words])

  const [phase, setPhase] = useState<'chars' | 'words'>('chars')
  const [queue, setQueue] = useState<string[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [animationToken, setAnimationToken] = useState(0)

  // Tracing goes through every character/word in order (like Learn), not a
  // shuffled/capped subset — it's stroke-order practice, not a quiz, so
  // there's no benefit to randomizing or limiting round count.
  const startSession = useCallback(() => {
    setPhase('chars')
    setQueue(charPool)
    setRoundIndex(0)
    setFinished(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charPool])

  useEffect(() => {
    if (charPool.length > 0) startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charPool.length])

  const currentCharId = phase === 'chars' && queue.length > 0 ? queue[roundIndex] : undefined
  const currentWord = phase === 'words' && queue.length > 0 ? wordsById[queue[roundIndex]] : undefined

  // Resizing the canvas backing store (even to the same size) clears it, so
  // this doubles as both "draw the guide for a new round" and "Clear".
  const drawGuide = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.fillStyle = 'rgba(120, 120, 120, 0.3)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (phase === 'chars' && currentCharId) {
      canvas.width = CANVAS_SIZE * dpr
      canvas.height = CANVAS_SIZE * dpr
      ctx.scale(dpr, dpr)
      ctx.font = `${CANVAS_SIZE * 0.75}px "Klee One", sans-serif`
      ctx.fillText(CHARACTERS_BY_ID[currentCharId].kana, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + CANVAS_SIZE * 0.05)
    } else if (phase === 'words' && currentWord) {
      const chars = [...currentWord.kana]
      canvas.width = WORD_CHAR_SIZE * chars.length * dpr
      canvas.height = WORD_CHAR_SIZE * dpr
      ctx.scale(dpr, dpr)
      ctx.font = `${WORD_CHAR_SIZE * 0.75}px "Klee One", sans-serif`
      chars.forEach((ch, i) => {
        ctx.fillText(ch, WORD_CHAR_SIZE * (i + 0.5), WORD_CHAR_SIZE / 2 + WORD_CHAR_SIZE * 0.05)
      })
    }
  }, [phase, currentCharId, currentWord])

  useEffect(() => {
    if (phase === 'chars') {
      if (!currentCharId) return
      drawGuide()
      speak(`characters/${currentCharId}`, CHARACTERS_BY_ID[currentCharId].kana)
    } else {
      if (!currentWord) return
      drawGuide()
      speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentCharId, currentWord?.id])

  const getPoint = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    isDrawingRef.current = true
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPoint(e)
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPoint(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const handlePointerUp = () => {
    isDrawingRef.current = false
  }

  const advance = useCallback(() => {
    if (roundIndex + 1 < queue.length) {
      setRoundIndex((i) => i + 1)
      return
    }
    if (phase === 'chars' && wordIds.length > 0) {
      setPhase('words')
      setQueue(wordIds)
      setRoundIndex(0)
      return
    }
    setFinished(true)
  }, [roundIndex, queue.length, phase, wordIds])

  if (!rowId || !isScopeReady(rowId)) return null
  if (charPool.length === 0) return null

  if (finished) {
    return (
      <PracticeSummary
        title="Tracing complete!"
        stats={[
          { label: 'Characters traced', value: charPool.length },
          { label: 'Words traced', value: wordIds.length },
        ]}
        backHref={isReview ? '/review' : `/practice/${rowId}`}
        onRetry={startSession}
      />
    )
  }

  if (phase === 'chars' && !currentCharId) return null
  if (phase === 'words' && !currentWord) return null

  const currentChar = currentCharId ? CHARACTERS_BY_ID[currentCharId] : undefined

  return (
    <div className="flex flex-col items-center gap-6">
      <BackToHubLink rowId={rowId} />
      <h2 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
        {phase === 'chars' ? 'Trace each character' : 'Trace each word'}
      </h2>
      <p className="-mt-4 text-sm text-neutral-500 dark:text-neutral-400">
        Round {roundIndex + 1} / {queue.length}
      </p>

      {phase === 'chars' && currentCharId && currentChar ? (
        <>
          <span className="text-lg text-neutral-500 dark:text-neutral-400">{currentChar.romaji}</span>
          <StrokeOrderAnimation characterId={currentCharId} playToken={animationToken} />
          <div className="flex gap-3">
            {supported && (
              <button
                type="button"
                onClick={() => speak(`characters/${currentCharId}`, currentChar.kana)}
                className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                aria-label="Hear the pronunciation again"
              >
                🔊 Again
              </button>
            )}
            <button
              type="button"
              onClick={() => setAnimationToken((t) => t + 1)}
              className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
              aria-label="Watch the stroke order again"
            >
              ✍️ Again
            </button>
          </div>
        </>
      ) : currentWord ? (
        <>
          <span className="text-lg font-semibold">{currentWord.meaning}</span>
          <span className="-mt-4 text-sm text-neutral-500 dark:text-neutral-400">{currentWord.romaji}</span>
          {supported && (
            <button
              type="button"
              onClick={() => speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)}
              className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
              aria-label="Hear the pronunciation again"
            >
              🔊 Again
            </button>
          )}
        </>
      ) : null}

      <div className="max-w-full overflow-x-auto">
        <canvas
          ref={canvasRef}
          style={{
            width: phase === 'chars' ? CANVAS_SIZE : WORD_CHAR_SIZE * [...(currentWord?.kana ?? '')].length,
            height: phase === 'chars' ? CANVAS_SIZE : WORD_CHAR_SIZE,
            touchAction: 'none',
          }}
          className="rounded-2xl border-2 border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={drawGuide}
          className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={advance}
          className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Next
        </button>
      </div>
    </div>
  )
}
