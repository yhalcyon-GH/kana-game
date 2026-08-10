import type { PointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackToHubLink } from '../../components/BackToHubLink'
import { PracticeSummary } from '../../components/PracticeSummary'
import { StrokeOrderAnimation } from '../../components/StrokeOrderAnimation'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useTTS } from '../../hooks/useTTS'

const CANVAS_SIZE = 280 // CSS pixels

// Free-form tracing practice: draw over a faint guide of the kana with a
// finger/mouse/stylus. Deliberately NOT graded — competing apps' handwriting
// recognition is the single most complained-about mechanic in that space
// (too strict, frequent false rejections), so this is muscle-memory
// practice, not a test. No SRS interaction; nothing here is scored.
export function TracingPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady, getScopeQuizCharacterIds } = useCurriculum()
  const { speak, supported } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId)) navigate('/', { replace: true })
  }, [rowId, isScopeReady, navigate])

  const pool = useMemo(() => getScopeQuizCharacterIds(rowId), [rowId, getScopeQuizCharacterIds])

  const [queue, setQueue] = useState<string[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [animationToken, setAnimationToken] = useState(0)

  // Tracing goes through every character in order (like Learn), not a
  // shuffled/capped subset — it's stroke-order practice, not a quiz, so
  // there's no benefit to randomizing or limiting round count.
  const startSession = useCallback(() => {
    setQueue(pool)
    setRoundIndex(0)
    setFinished(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool])

  useEffect(() => {
    if (pool.length > 0) startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length])

  const currentCharId = queue.length > 0 ? queue[roundIndex] : undefined

  // Resizing the canvas backing store (even to the same size) clears it, so
  // this doubles as both "draw the guide for a new round" and "Clear".
  const drawGuide = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !currentCharId) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = CANVAS_SIZE * dpr
    canvas.height = CANVAS_SIZE * dpr
    ctx.scale(dpr, dpr)
    ctx.font = `${CANVAS_SIZE * 0.75}px "Klee One", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(120, 120, 120, 0.3)'
    ctx.fillText(CHARACTERS_BY_ID[currentCharId].kana, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + CANVAS_SIZE * 0.05)
  }, [currentCharId])

  useEffect(() => {
    if (!currentCharId) return
    drawGuide()
    speak(`characters/${currentCharId}`, CHARACTERS_BY_ID[currentCharId].kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharId])

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
    if (roundIndex + 1 >= queue.length) {
      setFinished(true)
    } else {
      setRoundIndex((i) => i + 1)
    }
  }, [roundIndex, queue.length])

  if (!rowId || !isScopeReady(rowId)) return null
  if (pool.length === 0) return null

  if (finished) {
    return (
      <PracticeSummary
        title="Tracing complete!"
        stats={[{ label: 'Characters traced', value: queue.length }]}
        backHref={isReview ? '/review' : `/practice/${rowId}`}
        onRetry={startSession}
      />
    )
  }

  if (!currentCharId) return null
  const currentChar = CHARACTERS_BY_ID[currentCharId]

  return (
    <div className="flex flex-col items-center gap-6">
      <BackToHubLink rowId={rowId} />
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Round {roundIndex + 1} / {queue.length}
      </p>
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

      <canvas
        ref={canvasRef}
        style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, touchAction: 'none' }}
        className="rounded-2xl border-2 border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

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
