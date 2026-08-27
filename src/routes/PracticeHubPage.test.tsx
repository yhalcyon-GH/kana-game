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

function renderRowHub(categoryId: string, rowId: string, search = '') {
  return render(
    <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}${search}`]}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderReviewHubAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/practice/review${search}`]}>
      <Routes>
        <Route path="/practice/review" element={<PracticeHubPage rowIdOverride={REVIEW_SCOPE_ID} />} />
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

// Item 5: the Global Recommended Target no longer gets its own dedicated
// section/card — it's now a ⭐ badge on whichever normal grid card is the
// target. This counts how many such badges are on the page (0 or 1).
function recommendedMarkerCount(container: HTMLElement) {
  return container.querySelectorAll('[aria-label="Recommended"]').length
}

describe('Learn / Tracing Guide (Issue #33)', () => {
  it('shows the one-time guide on a fresh Hiragana あ〜お hub, highlighting both choices without covering them', () => {
    const { getByText, getByTestId, getByRole } = renderRowHub('hiragana', 'a-row')

    const learn = getByText('Learn').closest('button, a, div')!
    const tracing = getByText('Tracing').closest('button, a, div')!
    expect(learn).toHaveClass('ring-yellow-400')
    expect(tracing).toHaveClass('ring-yellow-400')

    const guide = getByTestId('learn-tracing-guide')
    expect(getByRole('img', { name: 'Tamamizu explains Learn and Tracing' })).toHaveAttribute('src', '/guide/learn-tracing.webp')
    // The guide is in normal document flow after the choices, so a small
    // viewport can scroll instead of the image covering either card.
    expect(learn.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(tracing.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  // Item 6: Learn/Tracing cards stay clickable while the Learn/Tracing
  // Guide shows — clicking stops the guide's narration, ends the guide
  // (marking it completed for this automatic first-time case), and
  // navigates straight to the clicked activity, rather than the old
  // behavior of being inert links until "Got it!" was clicked first.
  it('Learn/Tracing cards are clickable while the guide shows (Item 6), and Got it! also still dismisses it normally', () => {
    const { getByText, queryByTestId } = renderRowHub('hiragana', 'a-row')

    const learnWhileGuided = getByText('Learn').closest('button, a')!
    const tracingWhileGuided = getByText('Tracing').closest('button, a')!
    // Clickable now — not the old inert aria-disabled div.
    expect(learnWhileGuided.tagName).toBe('BUTTON')
    expect(tracingWhileGuided.tagName).toBe('BUTTON')

    fireEvent.click(getByText('Got it!'))

    const state = useProgressStore.getState()
    expect(queryByTestId('learn-tracing-guide')).toBeNull()
    expect(state.hasCompletedLearnTracingGuide).toBe(true)
    expect(state.hasCompletedIntroGuide).toBe(false)
    expect(state.taughtRowIds).toEqual([])
    expect(state.rowActivityCompletion).toEqual({})
    expect(state.characters).toEqual({})
    expect(state.words).toEqual({})
    const learnAfterDismiss = getByText('Learn').closest('a')!
    const tracingAfterDismiss = getByText('Tracing').closest('a')!
    expect(learnAfterDismiss).not.toHaveAttribute('aria-disabled')
    expect(tracingAfterDismiss).not.toHaveAttribute('aria-disabled')
    expect(learnAfterDismiss).toHaveAttribute('href', '/learn/hiragana/a-row')
    expect(tracingAfterDismiss).toHaveAttribute('href', '/practice/hiragana/a-row/tracing')
  })

  it('clicking Learn while the automatic Learn/Tracing Guide shows marks it completed and navigates to Learn (Item 6)', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
          <Route path="/learn/hiragana/a-row" element={<div>LEARN PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(useProgressStore.getState().hasCompletedLearnTracingGuide).toBe(false)
    fireEvent.click(getByText('Learn'))
    expect(useProgressStore.getState().hasCompletedLearnTracingGuide).toBe(true)
    expect(getByText('LEARN PAGE')).toBeInTheDocument()
  })

  it('clicking Tracing while the automatic Learn/Tracing Guide shows marks it completed and navigates to Tracing (Item 6)', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
          <Route path="/practice/hiragana/a-row/tracing" element={<div>TRACING PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(useProgressStore.getState().hasCompletedLearnTracingGuide).toBe(false)
    fireEvent.click(getByText('Tracing'))
    expect(useProgressStore.getState().hasCompletedLearnTracingGuide).toBe(true)
    expect(getByText('TRACING PAGE')).toBeInTheDocument()
  })

  it('clicking Learn during a manual Learn/Tracing Guide replay ends the replay without mutating the persisted flag, and navigates (Item 6)', () => {
    useProgressStore.getState().setHasCompletedLearnTracingGuide(true)
    const { getByText } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row?guide=learnTracing']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
          <Route path="/learn/hiragana/a-row" element={<div>LEARN PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(getByText('Learn'))
    expect(useProgressStore.getState().hasCompletedLearnTracingGuide).toBe(true)
    expect(getByText('LEARN PAGE')).toBeInTheDocument()
  })

  it('does not show again after completion or on any other row', () => {
    const first = renderRowHub('hiragana', 'a-row')
    fireEvent.click(first.getByText('Got it!'))
    first.unmount()

    expect(renderRowHub('hiragana', 'a-row').queryByTestId('learn-tracing-guide')).toBeNull()
    expect(renderRowHub('hiragana', 'ka-row').queryByTestId('learn-tracing-guide')).toBeNull()
  })
})

describe('Practice Guide (Issue #35)', () => {
  it('defers Practice Guide while the Learn / Tracing Guide is still visible', () => {
    useProgressStore.getState().markRowTaught('a-row')
    const hub = renderRowHub('hiragana', 'a-row')
    expect(hub.getByTestId('learn-tracing-guide')).toBeInTheDocument()
    expect(hub.queryByTestId('practice-guide')).toBeNull()
  })
  it('appears only after Learn or Tracing has completed on the first Hiragana row', () => {
    const fresh = renderRowHub('hiragana', 'a-row')
    expect(fresh.queryByTestId('practice-guide')).toBeNull()
    fresh.unmount()

    useProgressStore.getState().setHasCompletedLearnTracingGuide(true)
    useProgressStore.getState().markRowTaught('a-row')
    const afterLearn = renderRowHub('hiragana', 'a-row')
    expect(afterLearn.getByTestId('practice-guide')).toBeInTheDocument()
    afterLearn.unmount()

    useProgressStore.getState().resetProgress()
    useProgressStore.getState().setHasCompletedLearnTracingGuide(true)
    useProgressStore.getState().markRowActivityCompleted('a-row', 'tracing')
    const afterTracing = renderRowHub('hiragana', 'a-row')
    expect(afterTracing.getByTestId('practice-guide')).toBeInTheDocument()
    afterTracing.unmount()
  })

  it('highlights the Recommended card in-place (no separate section) and shows the Practice Guide until Got it restores the links', () => {
    useProgressStore.getState().setHasCompletedLearnTracingGuide(true)
    useProgressStore.getState().markRowTaught('a-row')
    const { getAllByRole, getByTestId, getByText, getByRole, queryByText, queryByTestId } = renderRowHub('hiragana', 'a-row')

    const guide = getByTestId('practice-guide')
    expect(queryByText('⭐ Recommended')).toBeNull()
    // This testid was the old (now-removed) duplicate Recommended section's
    // own marker — asserting its absence here (not queryByText, which can
    // never find a data-testid value) is what actually catches that
    // section being reintroduced.
    expect(queryByTestId('practice-guide-recommended')).toBeNull()
    const kanaQuizCard = getByText('Kana Quiz').closest('button, a')!
    expect(kanaQuizCard).toHaveClass('ring-yellow-400')
    expect(kanaQuizCard.querySelector('[aria-label="Recommended"]')).toHaveTextContent('⭐')
    expect(getByRole('img', { name: 'Tamamizu explains Practice and Recommended' })).toHaveAttribute('src', '/guide/practice-guide.webp')
    expect(getByText('Got it!')).toBeInTheDocument()
    expect(guide).not.toHaveTextContent('Now, let’s practice!')

    const activityCards = () =>
      [...getAllByRole('link'), ...getAllByRole('button')].filter(
        (card) => card.classList.contains('rounded-xl') && card.textContent !== 'Got it!',
      )
    expect(activityCards()).toHaveLength(6) // Learn + Tracing + 3 Practice + Optional, no duplicate Recommended card
  })

  it('Item 6: clicking a Practice card while the automatic Practice Guide is showing stops the guide, marks it completed, and navigates', () => {
    useProgressStore.getState().setHasCompletedLearnTracingGuide(true)
    useProgressStore.getState().markRowTaught('a-row')
    const { getByText } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
          <Route path="/practice/hiragana/a-row/kana-quiz" element={<div>KANA QUIZ PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(useProgressStore.getState().hasCompletedPracticeGuide).toBe(false)
    fireEvent.click(getByText('Kana Quiz'))
    expect(useProgressStore.getState().hasCompletedPracticeGuide).toBe(true)
    expect(getByText('KANA QUIZ PAGE')).toBeInTheDocument()
  })

  it('Item 6: clicking a Practice card during a manual Practice Guide replay ends the replay without mutating the persisted flag, and navigates', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row?guide=practice']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
          <Route path="/practice/hiragana/a-row/listening" element={<div>LISTENING PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(useProgressStore.getState().hasCompletedPracticeGuide).toBe(false)
    fireEvent.click(getByText('Listening'))
    expect(useProgressStore.getState().hasCompletedPracticeGuide).toBe(false)
    expect(getByText('LISTENING PAGE')).toBeInTheDocument()
  })

  it('does not show on another row after completing the first row', () => {
    useProgressStore.getState().setHasCompletedLearnTracingGuide(true)
    useProgressStore.getState().markRowTaught('a-row')
    expect(renderRowHub('hiragana', 'ka-row').queryByTestId('practice-guide')).toBeNull()
  })

  it('does not show again after dismissal and re-mount', () => {
    useProgressStore.getState().setHasCompletedLearnTracingGuide(true)
    useProgressStore.getState().markRowTaught('a-row')
    const first = renderRowHub('hiragana', 'a-row')
    fireEvent.click(first.getByText('Got it!'))
    first.unmount()
    expect(renderRowHub('hiragana', 'a-row').queryByTestId('practice-guide')).toBeNull()
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
    expect(queryByText('Practice saved kana and words that still need work (1 item)')).not.toBeNull()
  })
})

describe('PracticeHubPage Recommended Path (Issue #11)', () => {
  it('an untaught character-set row shows "Choose how to learn" with Learn and Tracing, no ⭐ Recommended yet', () => {
    const { queryByText, container } = renderRowHub('hiragana', 'ka-row')
    expect(queryByText('Choose how to learn')).not.toBeNull()
    expect(queryByText('Learn')).not.toBeNull()
    expect(queryByText('Tracing')).not.toBeNull()
    expect(recommendedMarkerCount(container)).toBe(0)
  })

  it('after Learn is completed, Recommended becomes Kana Quiz', () => {
    // a-row must be fully done first, or the single Global Recommended
    // Target (Issue #25) stays on a-row's own still-incomplete intro
    // instead of moving to ka-row.
    completeRow('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { queryByText, getAllByText, container } = renderRowHub('hiragana', 'ka-row')
    expect(recommendedMarkerCount(container)).toBe(1)
    expect(getAllByText('Kana Quiz').length).toBeGreaterThan(0)
    expect(queryByText('Choose how to learn')).toBeNull()
  })

  it('after Tracing alone is completed (no markRowTaught), Recommended also becomes Kana Quiz', () => {
    completeRow('a-row')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'tracing')
    const { getAllByText, container } = renderRowHub('hiragana', 'ka-row')
    expect(recommendedMarkerCount(container)).toBe(1)
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

  it('renders exactly Learn, Practice, and Optional sections — no separate Recommended section even once introduced (Item 5)', () => {
    completeRow('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { container } = renderRowHub('hiragana', 'ka-row')
    expect(sectionHeadings(container)).toEqual(['Learn', 'Practice', 'Optional'])
    expect(recommendedMarkerCount(container)).toBe(1)
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

  it('the Recommended card is exactly its normal Practice-grid card — no duplicate elsewhere (Item 5)', () => {
    completeRow('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { getAllByText, container } = renderRowHub('hiragana', 'ka-row')
    // Kana Quiz is Recommended here — only one card, now with a ⭐ badge.
    expect(getAllByText('Kana Quiz').length).toBe(1)
    expect(recommendedMarkerCount(container)).toBe(1)
  })

  it('an untaught row still has no ⭐ Recommended marker, but does have Practice and Optional', () => {
    const { container } = renderRowHub('hiragana', 'ka-row')
    expect(recommendedMarkerCount(container)).toBe(0)
    expect(sectionHeadings(container)).toEqual(['Choose how to learn', 'Practice', 'Optional'])
  })

  it('contrast-pairs rows omit Kana Quiz everywhere but still show Optional Kana Typing', () => {
    // This test inspects the normal post-guide link layout; the one-time
    // Sokuon Guide behavior has dedicated coverage in SokuonGuide.test.tsx.
    useProgressStore.getState().setHasCompletedSokuonGuide(true)
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
// Target shows a ⭐ marker — a row visited out of order never shows its
// own, even though its own local per-row UI (Choose how to learn/✓
// marks/Lesson complete) still works normally either way. Item 5: this is
// now always a badge on a normal grid card, never a separate section.
describe('PracticeHubPage Global Recommended Target (Issue #25)', () => {
  it('a later row visited before an earlier row is finished shows no ⭐ marker', () => {
    // a-row (curriculum-first) is still untouched — ka-row is not the
    // global target no matter what's done on ka-row itself.
    useProgressStore.getState().markRowTaught('ka-row')
    useProgressStore.getState().markRowActivityCompleted('ka-row', 'kanaQuiz')
    const { container } = renderRowHub('hiragana', 'ka-row')
    expect(recommendedMarkerCount(container)).toBe(0)
  })

  it('that later row still shows its own Lesson complete once its own path finishes, without ever being the global target', () => {
    completeRow('ka-row')
    // a-row was never touched, so ka-row is still not the global target —
    // but ka-row's OWN Lesson complete is about ka-row's own progress.
    const { queryByText, container } = renderRowHub('hiragana', 'ka-row')
    expect(recommendedMarkerCount(container)).toBe(0)
    expect(queryByText('Lesson complete')).not.toBeNull()
  })

  it('once the earlier row (a-row) is finished, the target moves to ka-row and its ⭐ marker appears', () => {
    completeRow('a-row')
    useProgressStore.getState().markRowTaught('ka-row')
    const { container } = renderRowHub('hiragana', 'ka-row')
    expect(recommendedMarkerCount(container)).toBe(1)
  })

  it('a-row itself still shows no ⭐ marker for its own intro step while it is the target', () => {
    const before = renderRowHub('hiragana', 'a-row')
    // a-row's intro (Learn/Tracing) is the target here — per the existing
    // "Choose how to learn" design, that specific state shows no ⭐ marker
    // (neither Learn nor Tracing is singled out).
    expect(before.queryByText('Choose how to learn')).not.toBeNull()
    expect(recommendedMarkerCount(before.container)).toBe(0)
    before.unmount()

    useProgressStore.getState().markRowTaught('a-row')
    const after = renderRowHub('hiragana', 'a-row')
    expect(recommendedMarkerCount(after.container)).toBe(1)
  })
})

// Issue #46: every in-context Guide can be manually replayed on its real
// screen via a `?guide=<id>` ephemeral target, even once its own completed
// flag is already true, without that dismissal ever writing the flag back.
describe('Manual Guide replay (Issue #46)', () => {
  function completeEveryGuide() {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    useProgressStore.getState().setHasCompletedLearnTracingGuide(true)
    useProgressStore.getState().setHasCompletedPracticeGuide(true)
    useProgressStore.getState().setHasCompletedSokuonGuide(true)
    useProgressStore.getState().setHasCompletedReviewGuide(true)
  }

  it('Learn / Tracing replays on hiragana/a-row after its flag is already true, and dismiss leaves the flag true', () => {
    completeEveryGuide()
    const hub = renderRowHub('hiragana', 'a-row', '?guide=learnTracing')
    expect(hub.getByTestId('learn-tracing-guide')).toBeInTheDocument()
    expect(hub.queryByTestId('practice-guide')).toBeNull()

    fireEvent.click(hub.getByText('Got it!'))

    expect(hub.queryByTestId('learn-tracing-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedLearnTracingGuide).toBe(true)
  })

  it('Practice replays on hiragana/a-row after its flag is already true, bypassing its normal preconditions, and dismiss leaves the flag true', () => {
    // Practice's automatic trigger normally also needs Learn/Tracing done
    // and the row's intro completed — a manual replay must still work even
    // when neither is true.
    useProgressStore.getState().setHasCompletedPracticeGuide(true)
    const hub = renderRowHub('hiragana', 'a-row', '?guide=practice')
    expect(hub.getByTestId('practice-guide')).toBeInTheDocument()
    expect(hub.queryByTestId('learn-tracing-guide')).toBeNull()

    fireEvent.click(hub.getByText('Got it!'))

    expect(hub.queryByTestId('practice-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedPracticeGuide).toBe(true)
    expect(useProgressStore.getState().hasCompletedLearnTracingGuide).toBe(false)
  })

  it('Sokuon replays on sokuon/sokuon-row after its flag is already true, and dismiss leaves the flag true', () => {
    completeEveryGuide()
    const hub = renderRowHub('sokuon', 'sokuon-row', '?guide=sokuon')
    expect(hub.getByTestId('sokuon-guide')).toBeInTheDocument()

    fireEvent.click(hub.getByText('Got it!'))

    expect(hub.queryByTestId('sokuon-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedSokuonGuide).toBe(true)
  })

  it('Review replays on the Review hub after its flag is already true, even with nothing due, and dismiss leaves the flag true', () => {
    completeEveryGuide()
    // Something must already be taught for the Review scope to be "ready"
    // at all (see isScopeReady) — this is the "reviewed everything" case,
    // not "never studied anything yet".
    useProgressStore.getState().markRowTaught('a-row')
    const hub = renderReviewHubAt('?guide=review')
    expect(hub.getByTestId('review-guide')).toBeInTheDocument()
    expect(hub.queryByText('Review complete!')).toBeNull()

    fireEvent.click(hub.getByText('Got it!'))

    expect(hub.queryByTestId('review-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedReviewGuide).toBe(true)
  })

  it("each replay only ever shows the selected Guide, and never mutates any Guide's completed flag while the flag started false", () => {
    // The realistic case for a fresh learner: replaying Practice from
    // Settings before Learn/Tracing was ever completed must not silently
    // mark either Guide as done via the replay's own dismissal.
    const hub = renderRowHub('hiragana', 'a-row', '?guide=practice')

    expect(hub.getByTestId('practice-guide')).toBeInTheDocument()
    expect(hub.queryByTestId('learn-tracing-guide')).toBeNull()

    fireEvent.click(hub.getByText('Got it!'))

    const state = useProgressStore.getState()
    expect(state.hasCompletedPracticeGuide).toBe(false)
    expect(state.hasCompletedLearnTracingGuide).toBe(false)
  })

  it('dismissing a replay removes the replay target and leaves the row taught/mastery/unlock state untouched', () => {
    useProgressStore.getState().markRowTaught('a-row')
    const before = useProgressStore.getState()
    const progressBefore = {
      taughtRowIds: before.taughtRowIds,
      rowActivityCompletion: before.rowActivityCompletion,
      characters: before.characters,
      words: before.words,
      unlockedRowIds: before.unlockedRowIds,
      lastStudied: before.lastStudied,
    }
    completeEveryGuide()
    const hub = renderRowHub('hiragana', 'a-row', '?guide=learnTracing')

    fireEvent.click(hub.getByText('Got it!'))

    const after = useProgressStore.getState()
    expect({
      taughtRowIds: after.taughtRowIds,
      rowActivityCompletion: after.rowActivityCompletion,
      characters: after.characters,
      words: after.words,
      unlockedRowIds: after.unlockedRowIds,
      lastStudied: after.lastStudied,
    }).toEqual(progressBefore)
  })

  it('an invalid replay id fails safely and shows the normal page', () => {
    completeEveryGuide()
    const hub = renderRowHub('hiragana', 'a-row', '?guide=not-a-real-guide')

    expect(hub.queryByTestId('learn-tracing-guide')).toBeNull()
    expect(hub.queryByTestId('practice-guide')).toBeNull()
    expect(hub.getByRole('link', { name: /Learn/ })).toBeInTheDocument()
  })

  it('reloading with a valid replay URL shows that Guide again', () => {
    completeEveryGuide()
    // "Reload" here just means mounting fresh at a URL that already has the
    // replay param — there's no separate persistence to lose.
    const hub = renderRowHub('sokuon', 'sokuon-row', '?guide=sokuon')
    expect(hub.getByTestId('sokuon-guide')).toBeInTheDocument()
  })
})

// Similar Letters (see GojuonRow.isSimilarLetters) — a supplementary
// comparison lesson, not part of the main curriculum progression.
describe('Similar Letters Practice Hub', () => {
  it('shows Learn, Tracing, Kana Quiz, Listening, Word Builder, and Kana Typing — the same activities as a normal hiragana row', () => {
    const hub = renderRowHub('hiragana', 'hiragana-similar-letters')
    expect(hub.getByRole('link', { name: /Learn/ })).toBeInTheDocument()
    expect(hub.getByRole('link', { name: /Tracing/ })).toBeInTheDocument()
    expect(hub.getByRole('link', { name: /Kana Quiz/ })).toBeInTheDocument()
    expect(hub.getByRole('link', { name: /Listening/ })).toBeInTheDocument()
    expect(hub.getByRole('link', { name: /Word Builder/ })).toBeInTheDocument()
    expect(hub.getByRole('link', { name: /Kana Typing/ })).toBeInTheDocument()
  })

  it('never shows the Recommended Path chrome (⭐/"Choose how to learn")', () => {
    const hub = renderRowHub('hiragana', 'hiragana-similar-letters')
    expect(hub.queryByText('⭐ Recommended')).toBeNull()
    expect(hub.queryByText('Choose how to learn')).toBeNull()
    expect(hub.queryByText('Lesson complete')).toBeNull()
  })

  it('does not affect the Global Recommended Target, even after completing its own activities', () => {
    const before = useProgressStore.getState().unlockedRowIds
    completeRow('hiragana-similar-letters')
    const hub = renderRowHub('hiragana', 'a-row')
    // a-row (the real first row) is still Recommended — Similar Letters'
    // own "completion" never substitutes for it.
    expect(hub.getByText('Learn')).toBeInTheDocument()
    expect(useProgressStore.getState().unlockedRowIds).toEqual(before)
  })

  it("completing its own game activities records completion under ITS OWN row id only — never a real row's", () => {
    useProgressStore.getState().markRowActivityCompleted('hiragana-similar-letters', 'kanaQuiz')
    const after = useProgressStore.getState()
    expect(after.rowActivityCompletion['hiragana-similar-letters']?.kanaQuiz).toBe(true)
    expect(after.rowActivityCompletion['a-row']).toBeUndefined()
  })
})
