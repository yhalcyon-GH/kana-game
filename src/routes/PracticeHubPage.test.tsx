import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
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
