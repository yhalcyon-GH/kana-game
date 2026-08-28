import type { PointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackToHubLink } from '../../components/BackToHubLink'
import { PracticeSummary } from '../../components/PracticeSummary'
import { TracingUnitAnimation } from '../../components/StrokeOrderAnimation'
import { WordImage } from '../../components/WordImage'
import { CHARACTERS_BY_ID, getCharacterAudioId } from '../../data/characters'
import { CATEGORIES_BY_ID, ROWS_BY_ID } from '../../data/curriculum'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useTTS } from '../../hooks/useTTS'
import { buildTracingUnit, buildTracingUnits, packTracingRows, unitCellWidth } from '../../lib/tracingUnits'
import type { PackedRow } from '../../lib/tracingUnits'
import { useProgressStore } from '../../store/progressStore'

const CANVAS_SIZE = 280 // CSS pixels, single-character phase (normal 1-glyph characters — unchanged)
const MAX_WORD_CELL_SIZE = 130 // CSS pixels per writing cell, upper bound — word phase and yōon char phase
const MAX_ROW_CELLS = 3 // writing-cell cap per row before wrapping (Step 8) — a yōon unit counts as 2 cells
const SMALL_GUIDE_SCALE = 0.65 // small ゃ/ゅ/ょ guide glyph size relative to a normal glyph (Step 15)

// Measures a container element's content-box width live via ResizeObserver
// (Step 12) — window.innerWidth doesn't reliably reflect the actual space
// left for the canvas after padding/sibling layout, and a ref-based
// measurement stays correct across viewport resize/orientation change.
function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

// Free-form tracing practice: draw over a faint guide of the kana with a
// finger/mouse/stylus. Deliberately NOT graded — competing apps' handwriting
// recognition is the single most complained-about mechanic in that space
// (too strict, frequent false rejections), so this is muscle-memory
// practice, not a test. No SRS interaction; nothing here is scored.
//
// Two phases: every character on its own (as before), then every word from
// this row spelled out in one continuous guide — carrying single-character
// stroke order into the multi-character rhythm of actually writing a word.
//
// 'contrast-pairs' categories (促音/長音) skip the character phase entirely
// and start straight in the word phase — there's no isolated "trace this
// one new glyph on its own" step for these, even for 促音's っ (a genuine
// new glyph); the rule is only ever traced as part of a whole word. See
// docs/curriculum-extensibility.md.
export function TracingPage() {
  const { categoryId, rowId } = useParams<{ categoryId: string; rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady, getScopeQuizCharacterIds, getScopeWords, isSimilarLettersRow } = useCurriculum()
  const { speak, supported } = useTTS()
  const markRowActivityCompleted = useProgressStore((s) => s.markRowActivityCompleted)
  const isReview = rowId === REVIEW_SCOPE_ID
  const isContrastPairs = CATEGORIES_BY_ID[categoryId ?? '']?.learnStyle === 'contrast-pairs'
  // Similar Letters (see GojuonRow.isSimilarLetters) is characters-only here:
  // "Tracing/Stroke: 100% Similar Letters targets" means exactly
  // row.characterIds (already what charPool below resolves to via
  // getScopeQuizCharacterIds), never a word phase — getScopeWords' Similar
  // Letters branch returns the WHOLE same-script normal word pool (see its
  // comment), which would leak tons of irrelevant normal-word tracing into
  // what's supposed to be a curated look-alike lesson. So `words` is forced
  // empty below instead of calling getScopeWords at all for this row, which
  // also makes advance() skip straight to finishing after the last
  // character (its "move to words phase" branch is guarded on
  // wordIds.length > 0).
  const isSimilarLetters = isSimilarLettersRow(rowId)
  // 📋 summary rows (see GojuonRow.isSummary) have no Tracing card on their
  // hub — a category-wide word list isn't a meaningful "trace this row's
  // words" phase — but guard direct navigation too, same as Kana Quiz does
  // for contrast-pairs categories.
  const isSummary = !!ROWS_BY_ID[rowId ?? '']?.isSummary
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  // Guards against a stale drawGuide() call's font-load promise resolving
  // AFTER a newer round has already started (see drawGuide's comment) —
  // only the call that's still current when its promise settles may paint.
  const drawTokenRef = useRef(0)
  const advanceLockedRef = useRef(false)

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId) || ROWS_BY_ID[rowId]?.categoryId !== categoryId || isSummary) {
      navigate('/', { replace: true })
    }
  }, [rowId, categoryId, isSummary, isScopeReady, navigate])

  const charPool = useMemo(() => getScopeQuizCharacterIds(rowId), [rowId, getScopeQuizCharacterIds])
  const words = useMemo(() => (isSimilarLetters ? [] : getScopeWords(rowId)), [rowId, getScopeWords, isSimilarLetters])
  const wordIds = useMemo(() => words.map((w) => w.id), [words])
  const wordsById = useMemo(() => Object.fromEntries(words.map((w) => [w.id, w])), [words])

  const [phase, setPhase] = useState<'chars' | 'words'>('chars')
  const [queue, setQueue] = useState<string[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [animationToken, setAnimationToken] = useState(0)

  // Tracing goes through every character/word in order (like Learn), not a
  // shuffled/capped subset — it's stroke-order practice, not a quiz, so
  // there's no benefit to randomizing or limiting round count. Contrast-pairs
  // categories start directly in the 'words' phase (see file header) and
  // never populate a 'chars' queue at all.
  const startSession = useCallback(() => {
    advanceLockedRef.current = false
    if (isContrastPairs) {
      setPhase('words')
      setQueue(wordIds)
    } else {
      setPhase('chars')
      setQueue(charPool)
    }
    setRoundIndex(0)
    setFinished(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charPool, wordIds, isContrastPairs])

  useEffect(() => {
    if (isContrastPairs ? wordIds.length > 0 : charPool.length > 0) startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charPool.length, wordIds.length, isContrastPairs])

  useEffect(() => {
    advanceLockedRef.current = false
  }, [phase, roundIndex])

  const currentCharId = phase === 'chars' && queue.length > 0 ? queue[roundIndex] : undefined
  const currentWord = phase === 'words' && queue.length > 0 ? wordsById[queue[roundIndex]] : undefined

  const [canvasWrapRef, availableWidth] = useContainerWidth<HTMLDivElement>()

  // The single shared layout model behind both the writing canvas and the
  // stroke-order animation area (Step 16) — never computed twice
  // independently. `unit` covers the character phase (1 unit, 1 or 2
  // cells); `rows` covers the word phase (packed TracingUnits, a yōon unit
  // never split across a row boundary — see packTracingRows). Falls back to
  // an empty layout when there's nothing to draw yet.
  const charUnit = useMemo(() => (currentCharId ? buildTracingUnit(currentCharId) : undefined), [currentCharId])
  const wordUnits = useMemo(
    () => (currentWord ? buildTracingUnits(currentWord.characterIds) : []),
    [currentWord],
  )
  const wordRows = useMemo<PackedRow[]>(() => packTracingRows(wordUnits, MAX_ROW_CELLS), [wordUnits])

  const layout = useMemo(() => {
    // Before the container's first real ResizeObserver measurement (or in a
    // test/no-layout environment such as jsdom, which never reports a
    // nonzero getBoundingClientRect width), fall back to sizing at the cap
    // rather than dividing by a bogus near-zero width — the resize effect
    // recomputes the real value the moment a measurement does arrive.
    if (phase === 'chars' && charUnit) {
      const cellWidth = unitCellWidth(charUnit)
      if (cellWidth <= 1) return { cellSize: CANVAS_SIZE, columns: 1, rows: 1 }
      const cellSize = availableWidth > 0 ? Math.max(1, Math.min(CANVAS_SIZE, Math.floor(availableWidth / cellWidth))) : CANVAS_SIZE
      return { cellSize, columns: cellWidth, rows: 1 }
    }
    if (phase === 'words' && wordRows.length > 0) {
      const columns = Math.min(MAX_ROW_CELLS, Math.max(...wordRows.map((r) => r.cellCount)))
      const cellSize =
        availableWidth > 0 ? Math.max(1, Math.min(MAX_WORD_CELL_SIZE, Math.floor(availableWidth / columns))) : MAX_WORD_CELL_SIZE
      return { cellSize, columns, rows: wordRows.length }
    }
    return { cellSize: CANVAS_SIZE, columns: 1, rows: 1 }
  }, [phase, charUnit, wordRows, availableWidth])

  // Resizing the canvas backing store (even to the same size) clears it AND
  // resets all context state (fillStyle/font/textAlign/etc. revert to their
  // defaults) — so the resize must happen *before* any style is set, not
  // after, or the guide silently renders in default black at the default
  // top-left anchor instead of the intended faint centered gray. Resizing
  // doubles as both "draw the guide for a new round" and "Clear".
  //
  // The guide text is painted onto <canvas>, which — unlike a DOM element
  // styled with .font-kana — does NOT get a free repaint when the Klee One
  // webfont finishes loading: fillText() rasterizes whatever font is
  // resolved at the moment it's called and never revisits that pixel data.
  // Tracing is often the very first page in a session to touch Klee One at
  // all (StrokeOrderAnimation is pure SVG, no .font-kana element renders
  // here), so on a cold load the font can still be in flight when drawGuide
  // first runs, and the guide silently rasterizes in the sans-serif
  // fallback forever — exactly the "sometimes, mostly right after loading"
  // bug report. Waiting on document.fonts.load() before the fillText call
  // fixes this: it resolves immediately if the font's already cached (the
  // common case after the first draw) and only actually waits on a cold
  // load. drawTokenRef discards a stale wait that resolves after a newer
  // round has already started.
  const drawGuide = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const token = ++drawTokenRef.current
    const { cellSize, columns, rows } = layout

    // Draws one glyph centered in the writing cell at (col, row) — sized
    // down (and nudged slightly lower, per Step 15) when it's a small
    // ゃ/ゅ/ょ, so it's unambiguous at a glance which half of a yōon unit is
    // which without deforming/cropping either glyph.
    const drawGlyph = (kana: string, col: number, row: number, isSmall: boolean) => {
      const fontSize = cellSize * 0.75 * (isSmall ? SMALL_GUIDE_SCALE : 1)
      ctx.font = `${fontSize}px "Klee One", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(120, 120, 120, 0.3)'
      const cx = cellSize * (col + 0.5)
      const cy = cellSize * (row + 0.5) + cellSize * (isSmall ? 0.12 : 0.05)
      ctx.fillText(kana, cx, cy)
    }

    if (phase === 'chars' && currentCharId && charUnit) {
      canvas.width = cellSize * columns * dpr
      canvas.height = cellSize * rows * dpr
      ctx.scale(dpr, dpr)
      const paint = () => {
        if (drawTokenRef.current !== token) return
        charUnit.glyphs.forEach((glyph, i) => drawGlyph(glyph.kana, i, 0, glyph.isSmall))
      }
      if (document.fonts?.load) {
        document.fonts.load(`${cellSize * 0.75}px "Klee One"`).then(paint, paint)
      } else {
        paint()
      }
    } else if (phase === 'words' && currentWord && wordRows.length > 0) {
      canvas.width = cellSize * columns * dpr
      canvas.height = cellSize * rows * dpr
      ctx.scale(dpr, dpr)
      const paint = () => {
        if (drawTokenRef.current !== token) return
        wordRows.forEach((packedRow, rowIndex) => {
          let col = 0
          packedRow.units.forEach((unit) => {
            unit.glyphs.forEach((glyph, glyphIndex) => {
              drawGlyph(glyph.kana, col + glyphIndex, rowIndex, glyph.isSmall)
            })
            col += unitCellWidth(unit)
          })
        })
      }
      if (document.fonts?.load) {
        document.fonts.load(`${cellSize * 0.75}px "Klee One"`).then(paint, paint)
      } else {
        paint()
      }
    }
  }, [phase, currentCharId, currentWord, charUnit, wordRows, layout])

  useEffect(() => {
    if (phase === 'chars') {
      if (!currentCharId) return
      drawGuide()
      speak(`characters/${getCharacterAudioId(currentCharId)}`, CHARACTERS_BY_ID[currentCharId].kana)
    } else {
      if (!currentWord) return
      drawGuide()
      speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentCharId, currentWord?.id])

  // Redraws the guide (without re-triggering audio/Clear semantics) when
  // the responsive layout itself changes — e.g. the container's first real
  // measurement after mount, or a viewport resize/orientation change (Step
  // 12) — so the canvas backing store and guide stay in sync with the
  // latest `layout.cellSize`/`columns`/`rows` rather than a stale draw from
  // before ResizeObserver reported the container's true width.
  useEffect(() => {
    if ((phase === 'chars' && currentCharId) || (phase === 'words' && currentWord)) drawGuide()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.cellSize, layout.columns, layout.rows])

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
    if (advanceLockedRef.current) return
    advanceLockedRef.current = true
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

  // Pure UI navigation — the mirror image of advance() above, but it must
  // NEVER touch markRowActivityCompleted/SRS/Review/any persisted state
  // (see file header's completion-semantics comment: only reaching
  // finished=true counts). Uses the same advanceLockedRef guard as advance()
  // so a rapid double-click can't double-step; the existing
  // `[phase, roundIndex]` effect above clears the lock the same way it does
  // after advance() changes those, so Next remains responsive afterward.
  const goBack = useCallback(() => {
    if (advanceLockedRef.current) return
    advanceLockedRef.current = true
    if (roundIndex > 0) {
      setRoundIndex((i) => i - 1)
      return
    }
    if (phase === 'words' && !isContrastPairs && !isSimilarLetters && charPool.length > 0) {
      setPhase('chars')
      setQueue(charPool)
      setRoundIndex(charPool.length - 1)
      return
    }
    navigate(`/practice/${categoryId}/${rowId}`)
  }, [roundIndex, phase, isContrastPairs, isSimilarLetters, charPool, navigate, categoryId, rowId])

  // Recommended Path completion — see KanaQuizPage's identical comment.
  // Finishing Tracing counts as "character introduction completed" exactly
  // like finishing Learn does — neither is required over the other, and
  // completing one never locks out the other (see PracticeHubPage's
  // "Choose how to learn" step and lib/recommendedPath.ts).
  useEffect(() => {
    if (finished && !isReview && !isSimilarLetters && rowId) markRowActivityCompleted(rowId, 'tracing')
  }, [finished, isReview, isSimilarLetters, rowId, markRowActivityCompleted])

  if (!rowId || !isScopeReady(rowId)) return null
  // Contrast-pairs categories may have zero new characters of their own
  // (see docs/curriculum-extensibility.md's note on 長音) — checking
  // charPool here would incorrectly hide Tracing entirely for those, so
  // check the queue that phase actually starts from instead.
  if (isContrastPairs ? words.length === 0 : charPool.length === 0) return null

  if (finished) {
    return (
      <PracticeSummary
        title="Tracing complete!"
        stats={
          isContrastPairs
            ? [{ label: 'Words traced', value: wordIds.length }]
            : isSimilarLetters
              ? [{ label: 'Characters traced', value: charPool.length }]
              : [
                  { label: 'Characters traced', value: charPool.length },
                  { label: 'Words traced', value: wordIds.length },
                ]
        }
        backHref={isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`}
        onRetry={startSession}
        continueAction={
          !isReview
            ? {
                label: 'Continue',
                to: `/practice/${categoryId}/${rowId}/${isContrastPairs ? 'listening' : 'kana-quiz'}`,
              }
            : undefined
        }
      />
    )
  }

  if (phase === 'chars' && !currentCharId) return null
  if (phase === 'words' && !currentWord) return null

  const currentChar = currentCharId ? CHARACTERS_BY_ID[currentCharId] : undefined

  return (
    <div className="flex flex-col items-center gap-6">
      <BackToHubLink rowId={rowId} categoryId={categoryId} />
      <h2 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
        {phase === 'chars' ? 'Trace each character' : 'Trace each word'}
      </h2>
      <p className="-mt-4 text-sm text-neutral-500 dark:text-neutral-400">
        Round {roundIndex + 1} / {queue.length}
      </p>

      {phase === 'chars' && currentCharId && currentChar ? (
        <>
          <span className="text-lg text-neutral-500 dark:text-neutral-400">{currentChar.romaji}</span>
          <TracingUnitAnimation characterId={currentCharId} playToken={animationToken} />
          <div className="flex gap-3">
            {supported && (
              <button
                type="button"
                onClick={() => speak(`characters/${getCharacterAudioId(currentCharId)}`, currentChar.kana)}
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
          <WordImage word={currentWord} className="h-14 w-14" />
          <span className="text-lg font-semibold">{currentWord.meaning}</span>
          <span className="-mt-4 text-sm text-neutral-500 dark:text-neutral-400">{currentWord.romaji}</span>
          <div className="flex max-w-full flex-col items-center gap-1 overflow-x-auto">
            {wordRows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-1">
                {row.units.map((unit, i) => (
                  <TracingUnitAnimation
                    key={`${unit.characterId}-${rowIndex}-${i}`}
                    characterId={unit.characterId}
                    playToken={animationToken}
                    size={layout.cellSize}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
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
      ) : null}

      {/* w-full so the ResizeObserver-measured width reflects the real
          available space (Step 12); overflow-x-auto is kept only as a
          last-resort safety net below the ~320px target width (Step 23) —
          the packed layout above is sized to need it. */}
      <div ref={canvasWrapRef} className="w-full max-w-full overflow-x-auto">
        <canvas
          ref={canvasRef}
          style={{
            width: layout.cellSize * layout.columns,
            height: layout.cellSize * layout.rows,
            touchAction: 'none',
          }}
          className="mx-auto rounded-2xl border-2 border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={goBack}
          className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
        >
          Back
        </button>
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
