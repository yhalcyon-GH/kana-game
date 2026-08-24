import { fireEvent, render } from '@testing-library/react'
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

// Fully completes a row's core path — used to move the single Global
// Recommended Target (Issue #25) past a-row so tests below can put ka-row
// under test without a-row's still-incomplete intro stealing the ⭐
// Recommended section instead.
function completeRow(rowId: string) {
  useProgressStore.getState().markRowTaught(rowId)
  useProgressStore.getState().markRowActivityCompleted(rowId, 'kanaQuiz')
  useProgressStore.getState().markRowActivityCompleted(rowId, 'listening')
  useProgressStore.getState().markRowActivityCompleted(rowId, 'wordBuilder')
}

describe('Learn / Tracing Guide (Issue #33)', () => {
  it('shows the one-time guide on a fresh Hiragana あ〜お hub, highlighting both choices without covering them', () => {
    const { getByRole, getByTestId } = renderRowHub('hiragana', 'a-row')

    const learn = getByRole('link', { name: /Learn/ })
    const tracing = getByRole('link', { name: /Tracing/ })
    expect(learn).toHaveClass('ring-yellow-400')
    expect(tracing).toHaveClass('ring-yellow-400')

    const guide = getByTestId('learn-tracing-guide')
    expect(getByRole('img', { name: 'Tamamizu explains Learn and Tracing' })).toHaveAttribute('src', '/guide/learn-tracing.webp')
    // The guide is in normal document flow after the choices, so a small
    // viewport can scroll instead of the image covering either card.
    expect(learn.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(tracing.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  it('keeps Learn and Tracing inaccessible until Got it, then restores both links without changing learning progress', () => {
    const { getByRole, getByText, queryByTestId } = renderRowHub('hiragana', 'a-row')

    const learnWhileGuided = getByRole('link', { name: /Learn/ })
    const tracingWhileGuided = getByRole('link', { name: /Tracing/ })
    expect(learnWhileGuided).toHaveAttribute('aria-disabled', 'true')
    expect(tracingWhileGuided).toHaveAttribute('aria-disabled', 'true')
    expect(learnWhileGuided).toHaveAttribute('tabindex', '-1')
    expect(tracingWhileGuided).toHaveAttribute('tabindex', '-1')
    expect(learnWhileGuided.tagName).not.toBe('A')
    expect(tracingWhileGuided.tagName).not.toBe('A')

    fireEvent.click(getByText('Got it!'))

    const state = useProgressStore.getState()
    expect(queryByTestId('learn-tracing-guide')).toBeNull()
    expect(state.hasCompletedLearnTracingGuide).toBe(true)
    expect(state.hasCompletedIntroGuide).toBe(false)
    expect(state.taughtRowIds).toEqual([])
    expect(state.rowActivityCompletion).toEqual({})
    expect(state.characters).toEqual({})
    expect(state.words).toEqual({})
    const learnAfterDismiss = getByRole('link', { name: /Learn/ })
    const tracingAfterDismiss = getByRole('link', { name: /Tracing/ })
    expect(learnAfterDismiss).not.toHaveAttribute('aria-disabled')
    expect(tracingAfterDismiss).not.toHaveAttribute('aria-disabled')
    expect(learnAfterDismiss).toHaveAttribute('href', '/learn/hiragana/a-row')
    expect(tracingAfterDismiss).toHaveAttribute('href', '/practice/hiragana/a-row/tracing')
  })

  it('does not show again after completion or on any other row', () => {
    const first = renderRowHub('hiragana', 'a-row')
    fireEvent.click(first.getByText('Got it!'))
    first.unmount()

    expect(renderRowHub('hiragana', 'a-row').queryByTestId('learn-tracing-guide')).toBeNull()
    expect(renderRowHub('hiragana', 'ka-row').queryByTestId('learn-tracing-guide')).toBeNull()
  })
})

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
    // a-row must be fully done first, or the single Global Recommended
    // Target (Issue #25) stays on a-row's own still-incomplete intro
    // instead of moving to ka-row.
    completeRow('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { queryByText, getAllByText } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('⭐ Recommended')).not.toBeNull()
    expect(getAllByText('Kana Quiz').length).toBeGreaterThan(0)
    expect(queryByText('Choose how to learn')).toBeNull()
  })

  it('after Tracing alone is completed (no markRowTaught), Recommended also becomes Kana Quiz', () => {
    completeRow('a-row')
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

describe('PracticeHubPage 4-section layout (Issue #15)', () => {
  function sectionHeadings(container: HTMLElement) {
    return Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
  }

  function cardLabelsAfter(container: HTMLElement, headingText: string) {
    const headings = Array.from(container.querySelectorAll('h2'))
    const heading = headings.find((h) => h.textContent === headingText)!
    const grid = heading.nextElementSibling!
    return Array.from(grid.querySelectorAll('a')).map((a) => a.querySelector('.font-semibold')?.textContent?.replace('✓', '').trim())
  }

  it('renders Learn, Practice, and Optional as separate sections (Recommended appears once introduced)', () => {
    completeRow('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { container } = renderRowHub('hiragana', 'ka-row')
    expect(sectionHeadings(container)).toEqual(['⭐ Recommended', 'Learn', 'Practice', 'Optional'])
  })

  it('the Learn section lists Learn before Tracing', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    const { container } = renderRowHub('hiragana', 'ka-row')
    expect(cardLabelsAfter(container, 'Learn')).toEqual(['Learn', 'Tracing'])
  })

  it('the Practice section lists Kana Quiz, then Listening, then Word Builder', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    const { container } = renderRowHub('hiragana', 'ka-row')
    expect(cardLabelsAfter(container, 'Practice')).toEqual(['Kana Quiz', 'Listening', 'Word Builder'])
  })

  it('Kana Typing lives only in the Optional section, not in Practice', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    const { container, getAllByText } = renderRowHub('hiragana', 'ka-row')
    expect(cardLabelsAfter(container, 'Practice')).not.toContain('Kana Typing')
    expect(cardLabelsAfter(container, 'Optional')).toEqual(['Kana Typing'])
    // Exactly one Kana Typing card exists on the page at all.
    expect(getAllByText('Kana Typing')).toHaveLength(1)
  })

  it('the Kana Typing card itself has no duplicated "Optional" text (the section heading already says it)', () => {
    useProgressStore.getState().markRowTaught('ka-row')
    const { container } = renderRowHub('hiragana', 'ka-row')
    const headings = Array.from(container.querySelectorAll('h2'))
    const optionalHeading = headings.find((h) => h.textContent === 'Optional')!
    const grid = optionalHeading.nextElementSibling!
    // The heading itself is the only "Optional" text in that section — the
    // card shows its real description instead of repeating the word.
    expect(grid.textContent).not.toMatch(/Optional/)
    expect(grid.textContent).toMatch(/Type the word/)
  })

  it('the Recommended card also appears as a normal card in its own section', () => {
    completeRow('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { getAllByText } = renderRowHub('hiragana', 'ka-row')
    // Kana Quiz is Recommended here, and must still show up in Practice too.
    expect(getAllByText('Kana Quiz').length).toBe(2)
  })

  it('an untaught row still has no ⭐ Recommended section, but does have Practice and Optional', () => {
    const { queryByText, container } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('⭐ Recommended')).toBeNull()
    expect(sectionHeadings(container)).toEqual(['Choose how to learn', 'Practice', 'Optional'])
  })

  it('contrast-pairs rows omit Kana Quiz everywhere but still show Optional Kana Typing', () => {
    const { container, queryByText } = renderRowHub('sokuon', 'sokuon-row')
    expect(queryByText('Kana Quiz')).toBeNull()
    expect(cardLabelsAfter(container, 'Practice')).toEqual(['Listening', 'Word Builder'])
    expect(cardLabelsAfter(container, 'Optional')).toEqual(['Kana Typing'])
  })

  it('Review keeps its own Weak Kana / Weak Words Learn section, and still separates Optional Kana Typing', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    const { container } = renderReviewHub()
    expect(cardLabelsAfter(container, 'Learn')).toEqual(['Weak Kana', 'Weak Words'])
    expect(cardLabelsAfter(container, 'Practice')).toEqual(['Kana Quiz', 'Listening', 'Word Builder'])
    expect(cardLabelsAfter(container, 'Optional')).toEqual(['Kana Typing'])
  })
})

// Issue #25: only the row that is currently the single Global Recommended
// Target shows a ⭐ Recommended section — a row visited out of order never
// shows its own, even though its own local per-row UI (Choose how to
// learn/✓ marks/Lesson complete) still works normally either way.
describe('PracticeHubPage Global Recommended Target (Issue #25)', () => {
  it('a later row visited before an earlier row is finished shows no ⭐ Recommended section', () => {
    // a-row (curriculum-first) is still untouched — ka-row is not the
    // global target no matter what's done on ka-row itself.
    useProgressStore.getState().markRowTaught('ka-row')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
    const { queryByText } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('⭐ Recommended')).toBeNull()
  })

  it('that later row still shows its own Lesson complete once its own path finishes, without ever being the global target', () => {
    completeRow('ka-row')
    // a-row was never touched, so ka-row is still not the global target —
    // but ka-row's OWN Lesson complete is about ka-row's own progress.
    const { queryByText } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('⭐ Recommended')).toBeNull()
    expect(queryByText('Lesson complete')).not.toBeNull()
  })

  it('once the earlier row (a-row) is finished, the target moves to ka-row and its Recommended section appears', () => {
    completeRow('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { queryByText } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('⭐ Recommended')).not.toBeNull()
  })

  it('a-row itself still shows its own Recommended section for its own next step while it is the target', () => {
    const before = renderRowHub('hiragana', 'a-row')
    // a-row's intro (Learn/Tracing) is the target here — per the existing
    // "Choose how to learn" design, that specific state shows no separate
    // Recommended card (neither Learn nor Tracing is singled out).
    expect(before.queryByText('Choose how to learn')).not.toBeNull()
    expect(before.queryByText('⭐ Recommended')).toBeNull()
    before.unmount()

    useProgressStore.getState().markRowTaught('a-row')
    const after = renderRowHub('hiragana', 'a-row')
    expect(after.queryByText('⭐ Recommended')).not.toBeNull()
  })
})
