import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID } from '../data/curriculum'
import { useProgressStore } from '../store/progressStore'
import { CategoryRowsPage } from './CategoryRowsPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

function renderHiragana() {
  return render(
    <MemoryRouter>
      <CategoryRowsPage title="ひらがな" description="" categoryIds={[DEFAULT_CATEGORY_ID]} />
    </MemoryRouter>,
  )
}

// Issue #25: this page shows the Recommended decoration on exactly the row
// matching the single Global Recommended Target (useCurriculum's
// globalRecommendedTarget) — no per-activity detail needed here, just
// which row.
describe('CategoryRowsPage Recommended row (Issue #25)', () => {
  it('a-row is Recommended before anything is learned', () => {
    const { getAllByText } = renderHiragana()
    expect(getAllByText('⭐ Recommended')).toHaveLength(1)
  })

  it('moves to ka-row once a-row is fully done', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'listening')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'wordBuilder')
    const { getAllByText, getByText } = renderHiragana()
    expect(getAllByText('⭐ Recommended')).toHaveLength(1)
    // ka-row's own card, not a-row's, carries it.
    expect(getByText('か〜こ').closest('a')?.textContent).toMatch(/Recommended/)
  })

  it('shows no Recommended row for a different category once its target has moved elsewhere', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'listening')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'wordBuilder')
    const { queryByText } = render(
      <MemoryRouter>
        <CategoryRowsPage title="カタカナ" description="" categoryIds={[KATAKANA_CATEGORY_ID]} />
      </MemoryRouter>,
    )
    // Hiragana isn't fully done yet (only a-row), so the target is still
    // ka-row (hiragana) — no katakana row is Recommended yet.
    expect(queryByText('⭐ Recommended')).toBeNull()
  })
})
