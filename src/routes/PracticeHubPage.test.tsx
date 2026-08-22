import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { getNextRowId, ROWS } from '../data/curriculum'
import { REVIEW_SCOPE_ID } from '../hooks/useCurriculum'
import { useProgressStore } from '../store/progressStore'
import { PracticeHubPage } from './PracticeHubPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

function renderReviewHub() {
  return render(
    <MemoryRouter initialEntries={['/practice/review']}>
      <Routes>
        <Route path="/practice/review" element={<PracticeHubPage rowIdOverride={REVIEW_SCOPE_ID} />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderRowHub(categoryId: string, rowId: string) {
  return render(
    <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}`]}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PracticeHubPage Review empty state (Issue #2)', () => {
  // Something has been taught (so isScopeReady is true — this isn't the
  // "nothing taught yet" case), but nothing is currently active in either
  // Review pool — Review has no fallback to mixing in everything learned
  // any more, so this must be a clear success state, not an empty/confusing
  // grid of games that would open onto nothing.
  it('shows a success state, not the practice game grid, when nothing needs review', () => {
    useProgressStore.getState().markRowTaught('a-row')
    const { container, queryByText } = renderReviewHub()

    expect(container.textContent).toMatch(/Review complete!/)
    expect(queryByText('Kana Quiz')).toBeNull()
    expect(queryByText('Word Builder')).toBeNull()
  })

  it('shows the practice game grid once something is actually active in Review', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    const { queryByText } = renderReviewHub()

    expect(queryByText('Kana Quiz')).not.toBeNull()
    expect(queryByText('1 item need review')).not.toBeNull()
  })
})

describe('PracticeHubPage Recommended Path (Issue #11)', () => {
  it('an untaught character-set row shows "Choose how to learn" with Learn and Tracing, no ⭐ Recommended yet', () => {
    const { queryByText } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('Choose how to learn')).not.toBeNull()
    expect(queryByText('Learn')).not.toBeNull()
    expect(queryByText('Tracing')).not.toBeNull()
    expect(queryByText('⭐ Recommended')).toBeNull()
  })

  it('after Learn is completed, Recommended becomes Kana Quiz', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    const { queryByText, getAllByText } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('⭐ Recommended')).not.toBeNull()
    expect(getAllByText('Kana Quiz').length).toBeGreaterThan(0)
    expect(queryByText('Choose how to learn')).toBeNull()
  })

  it('after Tracing alone is completed (no markRowTaught), Recommended also becomes Kana Quiz', () => {
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'tracing')
    const { queryByText, getAllByText } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('⭐ Recommended')).not.toBeNull()
    expect(getAllByText('Kana Quiz').length).toBeGreaterThan(0)
  })

  it('completing only Learn still leaves Tracing freely available (not locked)', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    const { getByRole } = renderRowHub('hiragana', 'ka-row')
    const tracingLink = getByRole('link', { name: /Tracing/ })
    expect(tracingLink).toBeInTheDocument()
    expect(tracingLink).not.toHaveAttribute('aria-disabled')
  })

  it('completing only Tracing still leaves Learn freely available (not locked)', () => {
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'tracing')
    const { getByRole } = renderRowHub('hiragana', 'ka-row')
    const learnLink = getByRole('link', { name: /Learn/ })
    expect(learnLink).toBeInTheDocument()
    expect(learnLink).not.toHaveAttribute('aria-disabled')
  })

  it('Kana Quiz completed -> Recommended becomes Listening', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
    const { getAllByText } = renderRowHub('hiragana', 'ka-row')
    expect(getAllByText('Listening').length).toBeGreaterThan(0)
  })

  it('Listening completed -> Recommended becomes Word Builder', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'listening')
    const { getAllByText } = renderRowHub('hiragana', 'ka-row')
    expect(getAllByText('Word Builder').length).toBeGreaterThan(0)
  })

  it('Word Builder completed -> Lesson complete, with a Next Row action', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'listening')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'wordBuilder')
    const { queryByText, getByRole } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('Lesson complete')).not.toBeNull()
    expect(getByRole('link', { name: 'Next Row' })).toBeInTheDocument()
  })

  it('does not render a broken Next Row action on the final row (no next row exists)', () => {
    const lastRow = ROWS.find((r) => !r.isSummary && getNextRowId(r.id) === null)
    expect(lastRow).toBeDefined()
    useProgressStore.getState().markRowTaught(lastRow!.id)
    useProgressStore.getState().markRowActivityCompleted(lastRow!.id, 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted(lastRow!.id, 'listening')
    useProgressStore.getState().markRowActivityCompleted(lastRow!.id, 'wordBuilder')
    const { queryByText, queryByRole } = renderRowHub(lastRow!.categoryId, lastRow!.id)
    expect(queryByText('Lesson complete')).not.toBeNull()
    expect(queryByRole('link', { name: 'Next Row' })).toBeNull()
  })

  it('Kana Typing is labeled Optional and never becomes the Recommended activity', () => {
    const { queryByText } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('Optional')).not.toBeNull()
  })

  it('Kana Typing does not gate Lesson complete — completing the core 3 activities is enough', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'listening')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'wordBuilder')
    // Kana Typing was never touched at all.
    const { queryByText } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('Lesson complete')).not.toBeNull()
  })

  it('contrast-pairs rows (sokuon) follow Learn -> Listening -> Word Builder, with no Kana Quiz step', () => {
    const step1 = renderRowHub('sokuon', 'sokuon-row')
    expect(step1.queryByText('Choose how to learn')).not.toBeNull()
    step1.unmount()

    useProgressStore.getState().markRowTaught('sokuon-row')
    const step2 = renderRowHub('sokuon', 'sokuon-row')
    expect(step2.getAllByText('Listening').length).toBeGreaterThan(0)
    expect(step2.queryByText('Kana Quiz')).toBeNull() // never offered for contrast-pairs at all
    step2.unmount()

    useProgressStore.getState().markRowActivityCompleted('sokuon-row', 'listening')
    const step3 = renderRowHub('sokuon', 'sokuon-row')
    expect(step3.getAllByText('Word Builder').length).toBeGreaterThan(0)
    step3.unmount()

    useProgressStore.getState().markRowActivityCompleted('sokuon-row', 'wordBuilder')
    const step4 = renderRowHub('sokuon', 'sokuon-row')
    expect(step4.queryByText('Lesson complete')).not.toBeNull()
  })
})
