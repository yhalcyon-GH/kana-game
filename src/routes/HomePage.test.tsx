import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { CHOUON_CATEGORY_ID, DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID, ROWS, SOKUON_CATEGORY_ID } from '../data/curriculum'
import { PRACTICE_CHECKPOINTS } from '../data/practiceCheckpoints'
import { useProgressStore } from '../store/progressStore'
import { useSavedItemsStore } from '../store/savedItemsStore'
import { HomePage } from './HomePage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

// Rows with an approved Restaurant/Cafe checkpoint (Issue #183) only reach
// Recommended Path 'done' once that score-independent checkpoint flag is set
// too (see recommendedPath.ts's getRecommendedActivity).
function completeCategoryRows(categoryId: string) {
  for (const row of ROWS.filter((r) => r.categoryId === categoryId && !r.isSummary)) {
    useProgressStore.getState().markRowTaught(row.id)
    useProgressStore.getState().markRowActivityCompleted(row.id, 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted(row.id, 'listening')
    useProgressStore.getState().markRowActivityCompleted(row.id, 'wordBuilder')
    if (PRACTICE_CHECKPOINTS.some((checkpoint) => checkpoint.afterRowId === row.id)) {
      useProgressStore.getState().markRowActivityCompleted(row.id, 'checkpoint')
    }
  }
}

function completeCategory(categoryId: string) {
  completeCategoryRows(categoryId)
  if (categoryId === 'hiragana' || categoryId === 'katakana') {
    useProgressStore.getState().markAssessmentCompleted(categoryId, { correct: 20, total: 20 })
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

  it('recommends the Hiragana Test after Hiragana rows/checkpoints, while assessment is incomplete', () => {
    completeCategoryRows(DEFAULT_CATEGORY_ID)
    const { getByRole } = renderHome()
    const hiraganaLink = getByRole('link', { name: /Hiragana/ })
    expect(hiraganaLink.textContent).toMatch(/Recommended/)
    expect(hiraganaLink.textContent).toMatch(/Test/)
    expect(hiraganaLink).toHaveAttribute('href', '/assessment/hiragana')
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

  it('recommends the ゃゅょ card once both っ and ー sections are done', () => {
    completeCategory(DEFAULT_CATEGORY_ID)
    completeCategory(KATAKANA_CATEGORY_ID)
    completeCategory(SOKUON_CATEGORY_ID)
    completeCategory(CHOUON_CATEGORY_ID)
    useProgressStore.getState().markAssessmentCompleted('sokuon-chouon', { correct: 0, total: 20 })
    const { getByRole } = renderHome()
    const youonLink = getByRole('link', { name: /ゃゅょ/ })
    expect(youonLink.textContent).toMatch(/Recommended/)
    expect(youonLink.textContent).not.toMatch(/Yōon/)
  })

  it('still recommends the ゃゅょ card once its rows are done and Special Katakana is next', () => {
    completeCategory(DEFAULT_CATEGORY_ID)
    completeCategory(KATAKANA_CATEGORY_ID)
    completeCategory(SOKUON_CATEGORY_ID)
    completeCategory(CHOUON_CATEGORY_ID)
    useProgressStore.getState().markAssessmentCompleted('sokuon-chouon', { correct: 0, total: 20 })
    completeCategory('youon')
    const { getByRole } = renderHome()
    const youonLink = getByRole('link', { name: /ゃゅょ/ })
    expect(youonLink.textContent).toMatch(/Recommended/)
    expect(youonLink.textContent).not.toMatch(/Yōon/)
  })

  it('shows the Yōon/Special assessment after every learning category is done', () => {
    for (const categoryId of ['hiragana', 'katakana', 'sokuon', 'chouon', 'youon', 'special-katakana']) {
      completeCategory(categoryId)
    }
    useProgressStore.getState().markAssessmentCompleted('sokuon-chouon', { correct: 0, total: 20 })
    const { getAllByRole } = renderHome()
    const recommendedLinks = getAllByRole('link').filter((link) => link.textContent?.includes('Recommended'))
    expect(recommendedLinks).toHaveLength(1)
    expect(recommendedLinks[0]).toHaveAttribute('href', '/assessment/youon-special-katakana')
  })

  it('shows FINAL KANA TEST, not the backing row, when the Final assessment is recommended', () => {
    for (const categoryId of ['hiragana', 'katakana', 'sokuon', 'chouon', 'youon', 'special-katakana']) {
      completeCategory(categoryId)
    }
    useProgressStore.getState().markAssessmentCompleted('sokuon-chouon', { correct: 0, total: 20 })
    useProgressStore.getState().markAssessmentCompleted('youon-special-katakana', { correct: 0, total: 20 })

    const { getByRole } = renderHome()
    const finalLink = getByRole('link', { name: /FINAL KANA TEST/ })
    expect(finalLink).toHaveAttribute('href', '/assessment/final-graduation')
    expect(finalLink.textContent).not.toMatch(/シェ〜ウォ.*Test/)
    expect(finalLink.textContent).not.toMatch(/Yōon/)
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

describe('HomePage Saved entry', () => {
  beforeEach(() => {
    useSavedItemsStore.setState({ savedCharacterIds: [], savedWordIds: [] })
  })

  it('shows a Saved card linking to /saved with a 0-item count when nothing is saved', () => {
    const { getByRole } = renderHome()
    const savedLink = getByRole('link', { name: /Saved/ })
    expect(savedLink).toHaveAttribute('href', '/saved')
    expect(savedLink.textContent).toMatch(/0 items/)
  })

  it('shows a count equal to saved characters plus saved words', () => {
    useSavedItemsStore.getState().toggleCharacter('a')
    useSavedItemsStore.getState().toggleCharacter('ki')
    useSavedItemsStore.getState().toggleWord('a-ai')
    const { getByRole } = renderHome()
    const savedLink = getByRole('link', { name: /Saved/ })
    expect(savedLink.textContent).toMatch(/3 items/)
  })

  it('is not styled as Recommended or Continue (no ⭐, no "Continue" text)', () => {
    const { getByRole } = renderHome()
    const savedLink = getByRole('link', { name: /Saved/ })
    expect(savedLink.textContent).not.toContain('⭐')
    expect(savedLink.textContent).not.toContain('Continue')
  })
})
