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
