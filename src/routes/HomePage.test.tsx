import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { CHOUON_CATEGORY_ID, DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID, ROWS, SOKUON_CATEGORY_ID } from '../data/curriculum'
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

describe('HomePage Continue card (Issue #23/#27)', () => {
  it('does not render for a first-time user with no resume history', () => {
    const { queryByText } = renderHome()
    expect(queryByText('Continue')).toBeNull()
  })

  it('shows the last-studied category/row and links to that row\'s Practice Hub, not the specific activity', () => {
    useProgressStore.getState().setLastStudied({ categoryId: 'hiragana', rowId: 'ka-row', activity: 'kanaQuiz' })
    const { getByRole } = renderHome()
    const continueLink = getByRole('link', { name: /Continue/ })
    expect(continueLink.textContent).toMatch(/Hiragana/)
    expect(continueLink.textContent).toMatch(/か〜こ・が〜ご/)
    expect(continueLink.textContent).not.toMatch(/Kana Quiz/)
    expect(continueLink).toHaveAttribute('href', '/practice/hiragana/ka-row')
  })

  it('resumes the row\'s Hub even when the last activity was Learn', () => {
    useProgressStore.getState().setLastStudied({ categoryId: 'hiragana', rowId: 'a-row', activity: 'learn' })
    const { getByRole } = renderHome()
    expect(getByRole('link', { name: /Continue/ })).toHaveAttribute('href', '/practice/hiragana/a-row')
  })

  it('renders below the section cards, not above them', () => {
    useProgressStore.getState().setLastStudied({ categoryId: 'hiragana', rowId: 'a-row', activity: 'learn' })
    const { getByRole } = renderHome()
    const continueLink = getByRole('link', { name: /Continue/ })
    const hiraganaLink = getByRole('link', { name: /^ひらがな/ })
    // DOCUMENT_POSITION_FOLLOWING (4) means continueLink comes AFTER hiraganaLink.
    expect(hiraganaLink.compareDocumentPosition(continueLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('styles "Continue" distinctly from Recommended — no ⭐/sparkle, just blue link-colored text', () => {
    useProgressStore.getState().setLastStudied({ categoryId: 'hiragana', rowId: 'a-row', activity: 'learn' })
    const { getByText } = renderHome()
    const continueText = getByText('Continue')
    expect(continueText.className).toMatch(/text-blue-600/)
    expect(continueText.textContent).not.toMatch(/⭐/)
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

  it('recommends the Yōon card once both sokuon and chōon are done (Sokuon -> Chōon -> Yōon)', () => {
    completeCategory(DEFAULT_CATEGORY_ID)
    completeCategory(KATAKANA_CATEGORY_ID)
    completeCategory(SOKUON_CATEGORY_ID)
    completeCategory(CHOUON_CATEGORY_ID)
    const { getByRole } = renderHome()
    expect(getByRole('link', { name: /Yōon/ }).textContent).toMatch(/Recommended/)
  })

  // Special Katakana (see curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID) is
  // bundled onto the SAME /youon page/nav entry as Yōon — no separate
  // top-level card — so the Yōon/ゃゅょ card is still the one that lights up
  // as Recommended once the target moves past Yōon itself into it.
  it('still recommends the Yōon/ゃゅょ card once yōon itself is done and Special Katakana is next', () => {
    completeCategory(DEFAULT_CATEGORY_ID)
    completeCategory(KATAKANA_CATEGORY_ID)
    completeCategory(SOKUON_CATEGORY_ID)
    completeCategory(CHOUON_CATEGORY_ID)
    completeCategory('youon')
    const { getByRole } = renderHome()
    expect(getByRole('link', { name: /Yōon/ }).textContent).toMatch(/Recommended/)
  })

  it('no card is Recommended once every category, including Special Katakana, is done', () => {
    for (const categoryId of ['hiragana', 'katakana', 'sokuon', 'chouon', 'youon', 'special-katakana']) {
      completeCategory(categoryId)
    }
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
