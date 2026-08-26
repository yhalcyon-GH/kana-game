import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { GUIDE_CATALOG } from '../data/guideCatalog'
import { useProgressStore } from '../store/progressStore'
import { SettingsPage } from './SettingsPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="landed-path">{`${location.pathname}${location.search}`}</div>
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Issue #19: "Always show romaji hints" opts into showing Listening/Word
// Builder's per-question romaji hint from the start. It is unrelated to
// Learn/Tracing (always show romaji already) and Kana Quiz/Kana Typing
// (unaffected by this setting entirely) — see progressStore.ts's comment.
describe('SettingsPage "Always show romaji hints" (Issue #19)', () => {
  it('is present and defaults to unchecked (OFF)', () => {
    const { getByText } = renderSettings()
    const label = getByText('Always show romaji hints').closest('label')!
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    expect(checkbox.checked).toBe(false)
  })

  it('toggling it updates the persisted store setting', () => {
    const { getByText } = renderSettings()
    const label = getByText('Always show romaji hints').closest('label')!
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement

    fireEvent.click(checkbox)

    expect(useProgressStore.getState().alwaysShowRomajiHints).toBe(true)
  })
})

// Issue #46: a data-driven Guides list replaces the standalone "View
// introduction again" row, letting every currently-implemented Guide be
// replayed from Settings.
describe('SettingsPage Guides list (Issue #46/#50)', () => {
  it('lists all six implemented Guides', () => {
    const { getByText } = renderSettings()
    for (const guide of GUIDE_CATALOG) {
      expect(getByText(guide.label)).toBeInTheDocument()
    }
    expect(GUIDE_CATALOG.map((g) => g.label)).toEqual([
      'Introduction',
      'Learn / Tracing',
      'Practice',
      'Review',
      'Sokuon',
      'Yōon',
    ])
  })

  it('Introduction still replays from step 1 via the existing flag toggle', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    useProgressStore.getState().markRowTaught('a-row')
    const { getByText } = renderSettings()

    fireEvent.click(getByText('Introduction'))

    const state = useProgressStore.getState()
    expect(state.hasCompletedIntroGuide).toBe(false)
    expect(state.taughtRowIds).toEqual(['a-row'])
  })

  it.each([
    ['Learn / Tracing', 'learnTracing', '/practice/hiragana/a-row'],
    ['Practice', 'practice', '/practice/hiragana/a-row'],
    ['Review', 'review', '/practice/review'],
    ['Sokuon', 'sokuon', '/practice/sokuon/sokuon-row'],
    ['Yōon', 'youon', '/practice/youon/youon-ka-row'],
  ])('selecting %s navigates to its real screen with a %s replay target', (label, id, path) => {
    const { getByText, getByTestId } = renderSettings()

    fireEvent.click(getByText(label))

    expect(getByTestId('landed-path')).toHaveTextContent(`${path}?guide=${id}`)
  })

  it.each(['Learn / Tracing', 'Practice', 'Review', 'Sokuon', 'Yōon'] as const)(
    'selecting %s does not touch any Guide completed flag or learning/progress state',
    (label) => {
      useProgressStore.getState().markRowTaught('a-row')
      const before = useProgressStore.getState()
      const guideFlagsBefore = {
        hasCompletedIntroGuide: before.hasCompletedIntroGuide,
        hasCompletedLearnTracingGuide: before.hasCompletedLearnTracingGuide,
        hasCompletedPracticeGuide: before.hasCompletedPracticeGuide,
        hasCompletedReviewGuide: before.hasCompletedReviewGuide,
        hasCompletedSokuonGuide: before.hasCompletedSokuonGuide,
        hasCompletedYouonGuide: before.hasCompletedYouonGuide,
      }
      const progressBefore = {
        taughtRowIds: before.taughtRowIds,
        rowActivityCompletion: before.rowActivityCompletion,
        characters: before.characters,
        words: before.words,
        unlockedRowIds: before.unlockedRowIds,
        lastStudied: before.lastStudied,
      }
      const { getByText } = renderSettings()

      fireEvent.click(getByText(label))

      const after = useProgressStore.getState()
      expect({
        hasCompletedIntroGuide: after.hasCompletedIntroGuide,
        hasCompletedLearnTracingGuide: after.hasCompletedLearnTracingGuide,
        hasCompletedPracticeGuide: after.hasCompletedPracticeGuide,
        hasCompletedReviewGuide: after.hasCompletedReviewGuide,
        hasCompletedSokuonGuide: after.hasCompletedSokuonGuide,
        hasCompletedYouonGuide: after.hasCompletedYouonGuide,
      }).toEqual(guideFlagsBefore)
      expect({
        taughtRowIds: after.taughtRowIds,
        rowActivityCompletion: after.rowActivityCompletion,
        characters: after.characters,
        words: after.words,
        unlockedRowIds: after.unlockedRowIds,
        lastStudied: after.lastStudied,
      }).toEqual(progressBefore)
    },
  )
})
