import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
