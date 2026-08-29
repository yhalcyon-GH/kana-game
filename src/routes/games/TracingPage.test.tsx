import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgressStore } from '../../store/progressStore'
import { TracingPage } from './TracingPage'

const canvasContext = {
  beginPath: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  scale: vi.fn(),
  stroke: vi.fn(),
}

function renderTracing() {
  return render(
    <MemoryRouter initialEntries={['/practice/hiragana/a-row/tracing']}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TracingPage', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('advances only one round when Next is clicked twice before rerender', () => {
    const { getByRole, getByText } = renderTracing()

    expect(getByText(/Round 1 \/ 5/)).toBeInTheDocument()
    act(() => {
      fireEvent.click(getByRole('button', { name: 'Next' }))
      fireEvent.click(getByRole('button', { name: 'Next' }))
    })

    expect(getByText(/Round 2 \/ 5/)).toBeInTheDocument()
  })

  // Issue #19: Tracing is a character-introduction stage alongside Learn,
  // so romaji stays always visible there too.
  it('always shows the current character\'s romaji', () => {
    const { getByText } = renderTracing()
    expect(getByText('a')).toBeInTheDocument()
  })

  // Item 7: reuse WordImage to show the current word's illustration during
  // the word phase only — never during the character phase.
  it('shows a word illustration during the word phase but not the character phase', () => {
    const { container, getByRole } = renderTracing()
    expect(container.textContent).toMatch(/Trace each character/)
    expect(container.querySelector('img[alt=""]')).toBeNull()

    let guard = 0
    while (!container.textContent?.includes('Trace each word') && guard < 20) {
      act(() => fireEvent.click(getByRole('button', { name: 'Next' })))
      guard += 1
    }
    expect(container.textContent).toMatch(/Trace each word/)
    // WordImage renders either a real <img alt=""> or the 🖼️ placeholder.
    const hasWordImage =
      container.querySelector('img[alt=""]') !== null ||
      Array.from(container.querySelectorAll('div[aria-hidden="true"]')).some((d) => d.textContent === '🖼️')
    expect(hasWordImage).toBe(true)
  })
})

describe('TracingPage Recommended Path completion (Issue #11)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function finishTracingSession(container: HTMLElement, getByRole: () => HTMLElement) {
    let guard = 0
    while (!container.textContent?.includes('Tracing complete!') && guard < 20) {
      act(() => fireEvent.click(getByRole()))
      guard += 1
    }
  }

  it('completing a full Tracing session counts as "character introduction completed", even without Learn', () => {
    const { container, getByRole } = renderTracing()
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'tracing')).toBe(false)
    finishTracingSession(container, () => getByRole('button', { name: 'Next' }))
    expect(container.textContent).toMatch(/Tracing complete!/)
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'tracing')).toBe(true)
    // markRowTaught (Learn) was never called — Tracing alone is enough.
    expect(useProgressStore.getState().isRowTaught('a-row')).toBe(false)
  })

  it('merely opening Tracing does not mark completion', () => {
    renderTracing()
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'tracing')).toBe(false)
  })

  it('the Tracing summary offers Continue to Kana Quiz', () => {
    const { container, getByRole } = renderTracing()
    finishTracingSession(container, () => getByRole('button', { name: 'Next' }))
    const continueLink = getByRole('link', { name: /continue/i })
    expect(continueLink).toHaveAttribute('href', '/practice/hiragana/a-row/kana-quiz')
  })

  // Regression guard for a normal row alongside the Similar Letters fixes
  // below: a normal row's Tracing completion must still write
  // rowActivityCompletion[rowId].tracing === true, unchanged.
  it('a normal row still writes rowActivityCompletion[rowId].tracing === true on completion', () => {
    const { container, getByRole } = renderTracing()
    finishTracingSession(container, () => getByRole('button', { name: 'Next' }))
    expect(useProgressStore.getState().rowActivityCompletion['a-row']?.tracing).toBe(true)
  })
})

// PR #53 final review: Similar Letters (see GojuonRow.isSimilarLetters) is a
// curated look-alike comparison lesson, not a normal row — Tracing for it
// must be 100% row.characterIds, character-phase only, with no word phase
// and no synthetic rowActivityCompletion write (there's no "learn"/"quiz"
// grouping tied to this row the way there is for real rows — see
// KanaQuizPage/ListeningPage/WordBuilderPage's identical guard).
describe('TracingPage — Similar Letters rows (PR #53 final review)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderSimilarLettersTracing(categoryId: string, rowId: string) {
    return render(
      <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}/tracing`]}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  function finishSession(container: HTMLElement, getByRole: () => HTMLElement) {
    let guard = 0
    while (!container.textContent?.includes('Tracing complete!') && guard < 30) {
      act(() => fireEvent.click(getByRole()))
      guard += 1
    }
    return guard
  }

  it('targets exactly row.characterIds for Hiragana Similar Letters (17 characters), never a wider word pool', () => {
    const { container, getByRole, getByText } = renderSimilarLettersTracing('hiragana', 'hiragana-similar-letters')
    expect(getByText(/Round 1 \/ 17/)).toBeInTheDocument()
    const rounds = finishSession(container, () => getByRole('button', { name: 'Next' }))
    expect(rounds).toBe(17)
  })

  it('targets exactly row.characterIds for Katakana Similar Letters (19 characters)', () => {
    const { container, getByRole, getByText } = renderSimilarLettersTracing('katakana', 'katakana-similar-letters')
    expect(getByText(/Round 1 \/ 19/)).toBeInTheDocument()
    const rounds = finishSession(container, () => getByRole('button', { name: 'Next' }))
    expect(rounds).toBe(19)
  })

  it('finishes after the last character WITHOUT transitioning into a word phase, and the summary shows only "Characters traced"', () => {
    const { container, getByRole, queryByText } = renderSimilarLettersTracing('hiragana', 'hiragana-similar-letters')
    finishSession(container, () => getByRole('button', { name: 'Next' }))
    expect(container.textContent).toMatch(/Tracing complete!/)
    expect(container.textContent).toMatch(/Characters traced/)
    expect(queryByText(/Words traced/)).not.toBeInTheDocument()
    // Never entered the 'Trace each word' heading at any point along the way.
    expect(container.textContent).not.toMatch(/Trace each word/)
  })

  it('does not create a synthetic rowActivityCompletion entry for either Similar Letters row after Tracing completes', () => {
    const hiragana = renderSimilarLettersTracing('hiragana', 'hiragana-similar-letters')
    finishSession(hiragana.container, () => hiragana.getByRole('button', { name: 'Next' }))
    hiragana.unmount()

    const katakana = renderSimilarLettersTracing('katakana', 'katakana-similar-letters')
    finishSession(katakana.container, () => katakana.getByRole('button', { name: 'Next' }))
    katakana.unmount()

    const completion = useProgressStore.getState().rowActivityCompletion
    expect(completion['hiragana-similar-letters']).toBeUndefined()
    expect(completion['katakana-similar-letters']).toBeUndefined()
    expect(useProgressStore.getState().isRowActivityCompleted('hiragana-similar-letters', 'tracing')).toBe(false)
    expect(useProgressStore.getState().isRowActivityCompleted('katakana-similar-letters', 'tracing')).toBe(false)
  })
})

// Similar Letters explanation images (シ・ツ, ソ・ン) — see
// "fix: polish section labels and similar-letter support". Katakana Similar
// Letters' character queue (row.characterIds, in KATAKANA_SIMILAR_GROUPS
// order) is: ア,マ, タ,ク,ケ,ワ, メ,ナ, シ,ツ, ス,ヌ, カ,ヤ, コ,ユ, ソ,リ,ン —
// so シ/ツ are rounds 9-10 and ソ/ン are rounds 17 and 19 (リ, round 18, has
// no mapped image).
describe('TracingPage — Similar Letters explanation images', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderSimilarLettersTracing(categoryId: string, rowId: string) {
    return render(
      <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}/tracing`]}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  function advanceRounds(getByRole: () => HTMLElement, count: number) {
    for (let i = 0; i < count; i++) act(() => fireEvent.click(getByRole()))
  }

  it('shows the シ・ツ explanation image while tracing シ and ツ, and not on the round right before them', () => {
    const { container, getByRole, getByText } = renderSimilarLettersTracing('katakana', 'katakana-similar-letters')
    advanceRounds(() => getByRole('button', { name: 'Next' }), 7) // round 8: ナ
    expect(getByText(/Round 8 \/ 19/)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()

    advanceRounds(() => getByRole('button', { name: 'Next' }), 1) // round 9: シ
    expect(getByText(/Round 9 \/ 19/)).toBeInTheDocument()
    let img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('similar-letters/shi-tsu.webp')

    advanceRounds(() => getByRole('button', { name: 'Next' }), 1) // round 10: ツ
    expect(getByText(/Round 10 \/ 19/)).toBeInTheDocument()
    img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('similar-letters/shi-tsu.webp')
  })

  it('shows the ソ・ン explanation image on ソ and ン, but not on リ in between', () => {
    const { container, getByRole, getByText } = renderSimilarLettersTracing('katakana', 'katakana-similar-letters')
    advanceRounds(() => getByRole('button', { name: 'Next' }), 16) // round 17: ソ
    expect(getByText(/Round 17 \/ 19/)).toBeInTheDocument()
    let img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('similar-letters/so-n.webp')

    advanceRounds(() => getByRole('button', { name: 'Next' }), 1) // round 18: リ (no mapped image)
    expect(getByText(/Round 18 \/ 19/)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()

    advanceRounds(() => getByRole('button', { name: 'Next' }), 1) // round 19: ン
    expect(getByText(/Round 19 \/ 19/)).toBeInTheDocument()
    img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('similar-letters/so-n.webp')
  })

  it('never shows a Similar Letters explanation image outside the Similar Letters lesson (normal katakana sa-row, which also includes シ and ソ)', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/katakana/katakana-sa-row/tracing']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(container.querySelector('img')).toBeNull()
  })
})

// New "Back" button (item-level previous character/word navigation) —
// pure UI navigation, never touches markRowActivityCompleted/SRS/Review/any
// persisted state (see TracingPage.tsx's goBack comment). MemoryRouter
// never updates window.location, so navigation-away assertions go through
// router state (useLocation), following PR #57's fix for the same pitfall.
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="landed-path">{`${location.pathname}${location.search}`}</div>
}

function renderTracingBackTest(categoryId: string, rowId: string) {
  return render(
    <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}/tracing`]}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function roundLabel(container: HTMLElement) {
  return container.querySelector('p')?.textContent ?? ''
}

function clickBack(container: HTMLElement) {
  const back = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Back')!
  fireEvent.click(back)
}

function clickNext(container: HTMLElement) {
  const next = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Next')!
  fireEvent.click(next)
}

describe('TracingPage Back button — normal character-set row (a-row: 5 chars, 4 words)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  it('A: on the 2nd character, Back returns to the 1st character', () => {
    const { container } = renderTracingBackTest('hiragana', 'a-row')
    expect(roundLabel(container)).toContain('Round 1 / 5')
    clickNext(container)
    expect(roundLabel(container)).toContain('Round 2 / 5')

    clickBack(container)

    expect(roundLabel(container)).toContain('Round 1 / 5')
    expect(container.querySelector('h2')?.textContent).toContain('character')
  })

  it('B: on the 2nd word, Back returns to the 1st word', () => {
    const { container } = renderTracingBackTest('hiragana', 'a-row')
    // Advance through all 5 characters into the words phase, then one more.
    for (let i = 0; i < 5; i++) clickNext(container)
    expect(roundLabel(container)).toContain('Round 1 / 4')
    clickNext(container)
    expect(roundLabel(container)).toContain('Round 2 / 4')

    clickBack(container)

    expect(roundLabel(container)).toContain('Round 1 / 4')
    expect(container.querySelector('h2')?.textContent).toContain('word')
  })

  it('C: on the 1st word, Back lands on the LAST character (chars phase)', () => {
    const { container } = renderTracingBackTest('hiragana', 'a-row')
    for (let i = 0; i < 5; i++) clickNext(container)
    expect(roundLabel(container)).toContain('Round 1 / 4')
    expect(container.querySelector('h2')?.textContent).toContain('word')

    clickBack(container)

    expect(container.querySelector('h2')?.textContent).toContain('character')
    expect(roundLabel(container)).toContain('Round 5 / 5')
  })

  it('D: on the 1st character, Back navigates to the row hub route', () => {
    const { container, getByTestId } = renderTracingBackTest('hiragana', 'a-row')
    expect(roundLabel(container)).toContain('Round 1 / 5')

    clickBack(container)

    expect(getByTestId('landed-path')).toHaveTextContent('/practice/hiragana/a-row')
  })

  it('G: clicking Back alone never marks row activity completed', () => {
    const spy = vi.spyOn(useProgressStore.getState(), 'markRowActivityCompleted')
    const { container } = renderTracingBackTest('hiragana', 'a-row')
    clickNext(container)

    clickBack(container)
    clickBack(container)

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('Back does not leave the Next button locked/unresponsive afterward', () => {
    const { container } = renderTracingBackTest('hiragana', 'a-row')
    clickNext(container) // round 2
    clickBack(container) // back to round 1

    clickNext(container) // should work, not be stuck locked

    expect(roundLabel(container)).toContain('Round 2 / 5')
  })
})

describe('TracingPage Back button — contrast-pairs row (sokuon-row: words phase only)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  it('E: on the 1st word, Back navigates to the hub and never enters a chars phase', () => {
    const { container, getByTestId } = renderTracingBackTest('sokuon', 'sokuon-row')
    expect(container.querySelector('h2')?.textContent).toContain('word')

    clickBack(container)

    expect(getByTestId('landed-path')).toHaveTextContent('/practice/sokuon/sokuon-row')
  })
})

// Responsive layout regression coverage (Steps A/B/C/G/I/J/K) — see
// lib/tracingUnits.test.ts for the packing-algorithm-level coverage (D-H)
// and StrokeOrderAnimation.test.tsx for the animation-composition coverage.
// jsdom never computes real layout (getBoundingClientRect always reports 0
// width), so the ResizeObserver-measured `availableWidth` stays 0 here and
// TracingPage's layout memo falls back to its cap-sized value — that
// fallback is still exercised, and the cell-count-driven WIDTH/HEIGHT ratio
// (columns vs rows) is what these tests check, since that ratio holds
// regardless of the absolute pixel cap.
describe('TracingPage responsive layout', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderRow(categoryId: string, rowId: string) {
    return render(
      <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}/tracing`]}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  function canvasSize(container: HTMLElement) {
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    const width = parseFloat(canvas.style.width)
    const height = parseFloat(canvas.style.height)
    return { width, height }
  }

  it('A: normal single character (a-row, あ) — 1x1 cell canvas, no horizontal overflow implied', () => {
    const { container } = renderRow('hiragana', 'a-row')
    const { width, height } = canvasSize(container)
    expect(width).toBe(height) // 1 column x 1 row
  })

  it('B: yōon character (きゃ) — wide 2-cell canvas, both glyphs fit (width = 2x height)', () => {
    const { container } = renderRow('youon', 'youon-ka-row')
    const { width, height } = canvasSize(container)
    expect(width).toBe(2 * height)
  })

  it('C: katakana yōon character (キャ) — same 2-cell shape as hiragana yōon', () => {
    const { container } = renderRow('youon', 'youon-katakana-ka-row')
    const { width, height } = canvasSize(container)
    expect(width).toBe(2 * height)
  })

  it('G + I: yōon word きゃく (kya + ku) packs as 2+1=3 cells in ONE row (a sokuon-like normal unit never splits きゃ apart)', () => {
    const { container, getByRole, getByText } = renderRow('youon', 'youon-ka-row')
    // Advance through all 6 characters (kya/kyu/kyo/gya/gyu/gyo) into the
    // word phase; youon-ka-kyaku (きゃく) is the first word.
    for (let i = 0; i < 6; i++) fireEvent.click(getByRole('button', { name: 'Next' }))
    expect(getByText(/Round 1/)).toBeInTheDocument()
    const { width, height } = canvasSize(container)
    // 3 cells wide, 1 row tall.
    expect(width).toBe(3 * height)
    // The stroke-animation area must show BOTH きゃ's glyphs (2 svgs) plus
    // く's (1 svg) = 3 total — never collapsing きゃ into just one.
    expect(container.querySelectorAll('svg')).toHaveLength(3)
  })

  it('I/J: sokuon word (おっと, the 2nd word in this row) — っ is 1 normal writing cell, unchanged (3 cells: お/っ/と)', () => {
    const { container, getByRole, getByText } = renderRow('sokuon', 'sokuon-row')
    // sokuon-row's first word is the plain minimal-pair partner (おと, 2
    // cells); おっと (with the actual っ) is the 2nd.
    fireEvent.click(getByRole('button', { name: 'Next' }))
    expect(getByText(/Round 2/)).toBeInTheDocument()
    const { width, height } = canvasSize(container)
    expect(width).toBe(3 * height)
    expect(container.querySelectorAll('svg')).toHaveLength(3)
  })

  it('K: pointer coordinates stay aligned with CSS coordinates under dynamic sizing (DPR contract preserved)', () => {
    Element.prototype.setPointerCapture = vi.fn()
    const { container } = renderRow('hiragana', 'a-row')
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 20 })
    fireEvent.pointerMove(canvas, { clientX: 15, clientY: 25 })
    expect(canvasContext.moveTo).toHaveBeenCalledWith(10, 20)
    expect(canvasContext.lineTo).toHaveBeenCalledWith(15, 25)
  })

  // L (Step 25): the user's blue tracing stroke was thinned from 10 to 7 CSS
  // px — pointer-down is where lineWidth gets (re)set on the mocked 2D
  // context for every new stroke.
  it('L: pointer-down sets the user-stroke lineWidth to 7 (thinned from 10)', () => {
    Element.prototype.setPointerCapture = vi.fn()
    const { container } = renderRow('hiragana', 'a-row')
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 20 })
    expect((canvasContext as unknown as { lineWidth: number }).lineWidth).toBe(7)
  })
})

// Step 24 bugfix coverage: the "TracingPage responsive layout" suite above
// only ever exercises the FALLBACK sizing (jsdom reports width 0 for every
// element, so `availableWidth` never rises above 0 — see that suite's own
// header comment). That leaves the actual responsive path — what happens
// once ResizeObserver/getBoundingClientRect report a real, narrow
// available width — completely untested, which is exactly how the
// self-reinforcing overflow loop (bug 1) and the animation/canvas
// footprint mismatch (bug 2) went unnoticed. This suite mocks
// `getBoundingClientRect` to deterministically report specific available
// widths (288/328/358/398 CSS px, modeling a 320/360/390/430px viewport
// after <main>'s `px-4` = 16px padding on each side, e.g. 320 - 2*16 =
// 288) so the real division-based sizing math in TracingPage's `layout`
// memo actually runs under test.
describe('TracingPage responsive layout — mocked real measurement (Step 24 bugfix)', () => {
  const VIEWPORT_WIDTHS = [320, 360, 390, 430] as const
  const AVAILABLE_WIDTHS = VIEWPORT_WIDTHS.map((w) => w - 32) // minus <main>'s px-4 (16px) each side

  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // getBoundingClientRect is mocked on HTMLElement.prototype (not just the
  // canvas wrapper div) since that's the only measurement TracingPage takes
  // (useContainerWidth's `el.getBoundingClientRect().width`, called
  // synchronously on mount inside useLayoutEffect, before ResizeObserver
  // ever fires) — no other code path in these tests depends on real
  // getBoundingClientRect geometry.
  function mockAvailableWidth(width: number) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width,
      height: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {}
      },
    } as DOMRect)
  }

  function renderRow(categoryId: string, rowId: string) {
    return render(
      <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}/tracing`]}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  function canvasCssSize(container: HTMLElement) {
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    return { width: parseFloat(canvas.style.width), height: parseFloat(canvas.style.height) }
  }

  function advanceToText(container: HTMLElement, getByRole: () => HTMLElement, text: string, maxClicks = 25) {
    let guard = 0
    while (!container.textContent?.includes(text) && guard < maxClicks) {
      fireEvent.click(getByRole())
      guard += 1
    }
    expect(container.textContent).toContain(text)
  }

  // F: root width-constraining classes, plus a computed-width check under a
  // narrow mocked available width — the fallback (390px, 3 x
  // MAX_WORD_CELL_SIZE) must never be able to inflate this root past the
  // real available width.
  it('F: TracingPage root carries w-full/min-w-0/max-w-full so a fallback-sized child cannot inflate it', () => {
    mockAvailableWidth(288)
    const { container, getByRole } = renderRow('sokuon', 'sokuon-row')
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toMatch(/\bw-full\b/)
    expect(root.className).toMatch(/\bmin-w-0\b/)
    expect(root.className).toMatch(/\bmax-w-full\b/)

    // おっと (3 normal cells: お/っ/と) — the canvas must fit within the
    // mocked 288px available width, not the 390px fallback.
    fireEvent.click(getByRole('button', { name: 'Next' }))
    const { width } = canvasCssSize(container)
    expect(width).toBeLessThanOrEqual(288)
  })

  it.each(AVAILABLE_WIDTHS)(
    'A: 3 normal cells (おっと) fit within a mocked %ipx available width',
    (availableWidth) => {
      mockAvailableWidth(availableWidth)
      const { container, getByRole } = renderRow('sokuon', 'sokuon-row')
      fireEvent.click(getByRole('button', { name: 'Next' })) // 2nd word: おっと
      const { width, height } = canvasCssSize(container)
      expect(width).toBe(3 * height)
      expect(width).toBeLessThanOrEqual(availableWidth)
    },
  )

  it.each(AVAILABLE_WIDTHS)('B: a yōon character (きゃ) 2-cell canvas fits within a mocked %ipx available width', (availableWidth) => {
    mockAvailableWidth(availableWidth)
    const { container } = renderRow('youon', 'youon-ka-row')
    const { width, height } = canvasCssSize(container)
    expect(width).toBe(2 * height)
    expect(width).toBeLessThanOrEqual(availableWidth)
  })

  // B2 (Step 25 bugfix): the character-phase ANIMATION for a yōon character
  // must shrink to match the canvas's own already-correct shrunk cell size
  // when space is tight (288px), never overflowing past it — but must stay
  // at the normal fixed 160px/cell (StrokeOrderAnimation's default) once
  // there's enough room, never growing past 160 even on a wide viewport.
  it('B2: yōon character (きゃ) animation footprint fits within a mocked 288px available width, matching the canvas', () => {
    mockAvailableWidth(288)
    const { container } = renderRow('youon', 'youon-ka-row')
    const { width: canvasWidth, height: canvasHeight } = canvasCssSize(container)
    expect(canvasWidth).toBe(2 * canvasHeight)
    expect(canvasWidth).toBeLessThanOrEqual(288)

    // Character-phase animation renders as a bare `flex gap-0` wrapper
    // (unlike the word phase's explicitly-width-styled row div), so its
    // total footprint is the sum of its two TracingCell children's widths.
    const animationWrapper = container.querySelectorAll('.flex.gap-0')[0] as HTMLElement
    expect(animationWrapper).toBeTruthy()
    const cells = animationWrapper.children
    expect(cells).toHaveLength(2)
    const cellWidth = parseFloat((cells[0] as HTMLElement).style.width)
    const footprint = cellWidth * 2
    expect(footprint).toBeLessThanOrEqual(288)
    // Cell size must match what the canvas itself uses (both derive from
    // the same shrunk layout.cellSize here, since 288/2 = 144 < 160).
    expect(cellWidth).toBe(canvasHeight)
    expect(cellWidth).toBeLessThan(160)

    // Still exactly 2 glyphs (きゃ's base き + small ゃ) — grouping unaffected.
    const svgs = animationWrapper.querySelectorAll('svg')
    expect(svgs).toHaveLength(2)
    // The small ゃ glyph keeps its existing ~65% scale relative to the base
    // glyph's (now-shrunk) cell size — unaffected by this sizing fix.
    const baseSvgWidth = parseFloat(svgs[0].getAttribute('width') ?? '0')
    const smallSvgWidth = parseFloat(svgs[1].getAttribute('width') ?? '0')
    expect(baseSvgWidth).toBe(cellWidth)
    expect(smallSvgWidth).toBe(Math.round(cellWidth * 0.65))
  })

  // B3: at each of the wider mocked viewport widths, the yōon character
  // animation must never shrink below 160px/cell when there's room for it
  // (160 * 2 = 320 fits within all of 328/358/398), and must never exceed
  // 160px/cell (no upsizing) — 160 is a ceiling, not a target.
  it.each(AVAILABLE_WIDTHS.filter((w) => w >= 320))(
    'B3: yōon character (きゃ) animation stays at the normal 160px/cell once a mocked %ipx available width has room',
    (availableWidth) => {
      mockAvailableWidth(availableWidth)
      const { container } = renderRow('youon', 'youon-ka-row')
      const animationWrapper = container.querySelectorAll('.flex.gap-0')[0] as HTMLElement
      const cellWidth = parseFloat((animationWrapper.children[0] as HTMLElement).style.width)
      expect(cellWidth).toBe(160)
    },
  )

  it.each(AVAILABLE_WIDTHS)(
    'C: きゃく (word phase) — BOTH the animation and the canvas footprint fit within a mocked %ipx available width',
    (availableWidth) => {
      mockAvailableWidth(availableWidth)
      const { container, getByRole, getByText } = renderRow('youon', 'youon-ka-row')
      // Advance through all 6 characters (kya/kyu/kyo/gya/gyu/gyo) into the
      // word phase; youon-ka-kyaku (きゃく) is the first word (see the
      // existing "G + I" test above for the same scenario).
      for (let i = 0; i < 6; i++) fireEvent.click(getByRole('button', { name: 'Next' }))
      expect(getByText(/Round 1/)).toBeInTheDocument()

      const { width: canvasWidth, height: canvasHeight } = canvasCssSize(container)
      expect(canvasWidth).toBe(3 * canvasHeight)
      expect(canvasWidth).toBeLessThanOrEqual(availableWidth)

      // Animation footprint: one row div sized to cellSize * columns.
      const rowDiv = container.querySelectorAll('.overflow-x-auto')[0]?.firstElementChild as HTMLElement
      expect(rowDiv).toBeTruthy()
      const animationWidth = parseFloat(rowDiv.style.width)
      expect(animationWidth).toBe(canvasWidth)
      expect(animationWidth).toBeLessThanOrEqual(availableWidth)
      // 3 total glyph cells: き + ゃ (2 svgs) + く (1 svg).
      expect(container.querySelectorAll('svg')).toHaveLength(3)
    },
  )

  // D + E: a 4-normal-glyph word (ちかてつ / chikatetsu: chi/ka/te/tsu) packs
  // as row1=3 cells, row2=1 cell LEFT-aligned (not centered) — for both the
  // canvas and the animation, and the animation's row footprint (columns,
  // total width) exactly matches the canvas's.
  it('D + E: 4-normal-glyph word (ちかてつ) — row2 is a left-aligned single cell, matching the canvas exactly', () => {
    mockAvailableWidth(358)
    const { container, getByRole } = renderRow('hiragana', 'ta-row')
    advanceToText(container, () => getByRole('button', { name: 'Next' }), 'subway')

    const { width: canvasWidth, height: canvasHeight } = canvasCssSize(container)
    // 3 columns wide, 2 rows tall (row1: 3 cells, row2: 1 cell).
    expect(canvasWidth).toBe(3 * (canvasHeight / 2))

    const animationRows = container.querySelectorAll('.overflow-x-auto')[0]?.children
    expect(animationRows).toHaveLength(2)
    const row1 = animationRows![0] as HTMLElement
    const row2 = animationRows![1] as HTMLElement
    // Both rows share the SAME fixed width (cellSize * columns) as the
    // canvas — the animation's column/cell footprint exactly matches the
    // canvas's (Step 24 bugfix requirement E).
    expect(parseFloat(row1.style.width)).toBe(canvasWidth)
    expect(parseFloat(row2.style.width)).toBe(canvasWidth)
    // Row 2 has exactly one glyph cell (1 svg), left-aligned via
    // justify-start inside its fixed-width row (never centered).
    expect(row2.className).toMatch(/justify-start/)
    expect(row2.querySelectorAll('svg')).toHaveLength(1)
    expect(row1.querySelectorAll('svg')).toHaveLength(3)
  })
})

describe('TracingPage Back button — Similar Letters row (characters-only, no words phase)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  it('F: 2nd character -> Back -> 1st character; 1st character -> Back -> hub; never enters a words phase', () => {
    const { container, getByTestId } = renderTracingBackTest('hiragana', 'hiragana-similar-letters')
    expect(container.querySelector('h2')?.textContent).toContain('character')
    const total = roundLabel(container)
    expect(total).toMatch(/Round 1 \/ \d+/)

    clickNext(container)
    expect(roundLabel(container)).toContain('Round 2')
    expect(container.querySelector('h2')?.textContent).toContain('character')

    clickBack(container)
    expect(roundLabel(container)).toContain('Round 1')
    expect(container.querySelector('h2')?.textContent).toContain('character')

    clickBack(container)
    expect(getByTestId('landed-path')).toHaveTextContent('/practice/hiragana/hiragana-similar-letters')
  })
})

// Special Katakana (see curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID) —
// reuses the existing character-set Tracing flow, generalized only via
// tracingUnits.ts's small-vowel additions (see that file's own tests for
// the exact glyph-expansion coverage). This just confirms the real
// TracingPage renders normally around a 2-glyph Special Katakana target,
// same as it already does for yōon.
describe('TracingPage — Special Katakana (2-glyph targets, small vowel kana)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('/practice/special-katakana/special-katakana-fa-row/tracing starts in the character phase and does not crash on a 2-glyph target with a small vowel kana', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/practice/special-katakana/special-katakana-fa-row/tracing']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(getByText('Trace each character')).toBeInTheDocument()
    expect(getByText(/Round 1 \/ 6/)).toBeInTheDocument()
  })

  it('/practice/special-katakana/special-katakana-she-row/tracing (session 2) also renders normally', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/practice/special-katakana/special-katakana-she-row/tracing']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(getByText('Trace each character')).toBeInTheDocument()
  })
})
