import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID, ROWS, SOKUON_CATEGORY_ID } from '../data/curriculum'
import { useProgressStore } from '../store/progressStore'
import { HomePage } from './HomePage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

function completeCategory(categoryId: string) {
  for (const row of ROWS.filter((r) => r.categoryId === categoryId && !r.isSummary)) {
    useProgressStore.getState().markRowTaught(row.id)
    useProgressStore.getState().markRowActivityCompleted(row.id, 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted(row.id, 'listening')
    useProgressStore.getState().markRowActivityCompleted(row.id, 'wordBuilder')
  }
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage Continue card (Issue #23)', () => {
  it('does not render for a first-time user with no resume history', () => {
    const { queryByText } = renderHome()
    expect(queryByText('Continue')).toBeNull()
  })

  it('shows the last-studied category/row/activity and links back to it', () => {
    useProgressStore.getState().setLastStudied({ categoryId: 'hiragana', rowId: 'ka-row', activity: 'kanaQuiz' })
    const { getByRole } = renderHome()
    const continueLink = getByRole('link', { name: /Continue/ })
    expect(continueLink.textContent).toMatch(/Hiragana/)
    expect(continueLink.textContent).toMatch(/Kana Quiz/)
    expect(continueLink).toHaveAttribute('href', '/practice/hiragana/ka-row/kana-quiz')
  })

  it('links Learn back to the Learn page, not a practice route', () => {
    useProgressStore.getState().setLastStudied({ categoryId: 'hiragana', rowId: 'a-row', activity: 'learn' })
    const { getByRole } = renderHome()
    expect(getByRole('link', { name: /Continue/ })).toHaveAttribute('href', '/learn/hiragana/a-row')
  })
})

describe('HomePage section Recommended (Issue #21)', () => {
  it('recommends exactly the Hiragana card before anything is learned', () => {
    const { getAllByRole, getByRole } = renderHome()
    const hiraganaLink = getByRole('link', { name: /Hiragana/ })
    expect(hiraganaLink.textContent).toMatch(/Recommended/)

    // Only one card is ever marked Recommended.
    const recommendedLinks = getAllByRole('link').filter((link) => link.textContent?.includes('Recommended'))
    expect(recommendedLinks).toHaveLength(1)
    expect(recommendedLinks[0]).toBe(hiraganaLink)
  })

  it('moves to the Katakana card once hiragana is fully done', () => {
    completeCategory(DEFAULT_CATEGORY_ID)
    const { getByRole } = renderHome()
    expect(getByRole('link', { name: /Hiragana/ }).textContent).not.toMatch(/Recommended/)
    expect(getByRole('link', { name: /Katakana/ }).textContent).toMatch(/Recommended/)
  })

  it('recommends the bundled "Stop & Long Sound" card once sokuon is next (hiragana + katakana done)', () => {
    completeCategory(DEFAULT_CATEGORY_ID)
    completeCategory(KATAKANA_CATEGORY_ID)
    const { getByRole } = renderHome()
    expect(getByRole('link', { name: /Stop & Long Sound/ }).textContent).toMatch(/Recommended/)
  })

  it('still recommends the bundled card once sokuon (but not chōon) is done too', () => {
    completeCategory(DEFAULT_CATEGORY_ID)
    completeCategory(KATAKANA_CATEGORY_ID)
    completeCategory(SOKUON_CATEGORY_ID)
    const { getByRole } = renderHome()
    expect(getByRole('link', { name: /Stop & Long Sound/ }).textContent).toMatch(/Recommended/)
  })

  it('no card is Recommended once every category is done', () => {
    for (const categoryId of ['hiragana', 'katakana', 'sokuon', 'chouon', 'youon']) completeCategory(categoryId)
    const { getAllByRole } = renderHome()
    const recommendedLinks = getAllByRole('link').filter((link) => link.textContent?.includes('Recommended'))
    expect(recommendedLinks).toHaveLength(0)
  })
})

// Issue #25: Home's card shows the exact row + activity from the single
// Global Recommended Target, not just the category.
describe('HomePage Recommended shows row + activity (Issue #25)', () => {
  it('shows a-row\'s intro (Learn) before anything is learned', () => {
    const { getByRole } = renderHome()
    const hiraganaLink = getByRole('link', { name: /Hiragana/ })
    expect(hiraganaLink.textContent).toMatch(/あ〜お/)
    expect(hiraganaLink.textContent).toMatch(/Learn/)
  })

  it('shows Kana Quiz once a-row\'s intro is done', () => {
    useProgressStore.getState().markRowTaught('a-row')
    const { getByRole } = renderHome()
    const hiraganaLink = getByRole('link', { name: /Hiragana/ })
    expect(hiraganaLink.textContent).toMatch(/あ〜お/)
    expect(hiraganaLink.textContent).toMatch(/Kana Quiz/)
  })
})
