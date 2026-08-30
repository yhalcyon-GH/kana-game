import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProgressStore } from '../store/progressStore'
import { LearnPage } from '../routes/LearnPage'
import { PracticeHubPage } from '../routes/PracticeHubPage'
import { TracingPage } from '../routes/games/TracingPage'
import { PITCH_ACCENT_NOTE_TEXT } from './PitchAccentNote'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

function renderLearn(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/learn/:categoryId/:rowId" element={<LearnPage />} />
        <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderTracing(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PitchAccentNote — Learn Step B word list', () => {
  it('appears on hiragana a-row Step B, immediately before the word cards', () => {
    const { getByText, getAllByText } = renderLearn('/learn/hiragana/a-row')
    // a-row has no learnBatches, so 5 clicks of Next reach the last
    // character, then "See them all" -> full recap -> "See the words" -> B.
    for (let i = 0; i < 4; i++) fireEvent.click(getByText('Next'))
    fireEvent.click(getAllByText('See them all')[0])
    fireEvent.click(getByText('See the words'))
    expect(getByText(PITCH_ACCENT_NOTE_TEXT)).toBeInTheDocument()
  })

  it('does not appear on any other row (ka-row)', () => {
    const { getByText, getAllByText, queryByText } = renderLearn('/learn/hiragana/ka-row')
    // ka-row has learnBatches (2 batches of 5) — click through both batches.
    for (let i = 0; i < 4; i++) fireEvent.click(getByText('Next'))
    fireEvent.click(getByText('See this set'))
    fireEvent.click(getByText('Next set'))
    for (let i = 0; i < 4; i++) fireEvent.click(getByText('Next'))
    fireEvent.click(getAllByText('See them all')[0])
    fireEvent.click(getByText('See the words'))
    expect(queryByText(PITCH_ACCENT_NOTE_TEXT)).toBeNull()
  })
})

describe('PitchAccentNote — Tracing Overview Words section', () => {
  it('appears on hiragana a-row Overview, immediately before the word cards', () => {
    const { getByText } = renderTracing('/practice/hiragana/a-row/tracing')
    expect(getByText(PITCH_ACCENT_NOTE_TEXT)).toBeInTheDocument()
  })

  it('does not appear on the Tracing Overview of any other row (ka-row)', () => {
    const { queryByText } = renderTracing('/practice/hiragana/ka-row/tracing')
    expect(queryByText(PITCH_ACCENT_NOTE_TEXT)).toBeNull()
  })

  it('does not appear on a row with no Words section (Similar Letters)', () => {
    const { queryByText } = renderTracing('/practice/hiragana/hiragana-similar-letters/tracing')
    expect(queryByText(PITCH_ACCENT_NOTE_TEXT)).toBeNull()
  })
})
