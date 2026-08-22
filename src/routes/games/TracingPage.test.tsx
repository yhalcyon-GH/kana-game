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
})
