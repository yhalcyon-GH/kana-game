import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SOKUON_GUIDE_LOCALE, SOKUON_GUIDE_CONTENT } from '../data/sokuonGuideContent'
import { PracticeHubPage } from '../routes/PracticeHubPage'
import { useProgressStore } from '../store/progressStore'

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))

vi.mock('../hooks/useTTS', () => ({ useTTS: () => tts }))

const content = SOKUON_GUIDE_CONTENT[DEFAULT_SOKUON_GUIDE_LOCALE]

function renderHub(categoryId = 'sokuon', rowId = 'sokuon-row') {
  return render(
    <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}`]}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  // Introduction always precedes concept guides in the real App. This
  // makes each test fresh specifically for the independent Sokuon state.
  useProgressStore.getState().setHasCompletedIntroGuide(true)
  tts.speak.mockReset()
  tts.stop.mockReset()
})

describe('Sokuon Guide (Issue #44)', () => {
  it('shows once on the first Sokuon hub with the exact slide, subtitle, and narration', () => {
    const hub = renderHub()

    expect(hub.getByTestId('sokuon-guide')).toHaveAttribute('role', 'dialog')
    expect(hub.getByRole('img', { name: 'Tamamizu explains the small tsu' })).toHaveAttribute(
      'src',
      '/guide/slide-sokuon.webp',
    )
    expect(hub.getByText(content.subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenCalledWith(content.audioKey, content.subtitle, content.lang)
  })

  it('disables hub activities until Got it, then restores links without changing learning progress', () => {
    const hub = renderHub()
    const before = useProgressStore.getState()
    const progressBefore = {
      taughtRowIds: before.taughtRowIds,
      rowActivityCompletion: before.rowActivityCompletion,
      characters: before.characters,
      words: before.words,
      unlockedRowIds: before.unlockedRowIds,
      lastStudied: before.lastStudied,
    }

    const activityCards = () => hub.getAllByRole('link').filter((card) => card.classList.contains('rounded-xl'))
    expect(activityCards().length).toBeGreaterThan(0)
    for (const card of activityCards()) {
      expect(card).toHaveAttribute('aria-disabled', 'true')
      expect(card).toHaveAttribute('tabindex', '-1')
      expect(card.tagName).not.toBe('A')
    }

    fireEvent.click(hub.getByText(content.dismissLabel))

    expect(hub.queryByTestId('sokuon-guide')).toBeNull()
    expect(tts.stop).toHaveBeenCalled()
    const after = useProgressStore.getState()
    expect(after.hasCompletedSokuonGuide).toBe(true)
    expect(after.hasCompletedIntroGuide).toBe(true)
    expect(after.hasCompletedLearnTracingGuide).toBe(false)
    expect(after.hasCompletedPracticeGuide).toBe(false)
    expect(after.hasCompletedReviewGuide).toBe(false)
    expect({
      taughtRowIds: after.taughtRowIds,
      rowActivityCompletion: after.rowActivityCompletion,
      characters: after.characters,
      words: after.words,
      unlockedRowIds: after.unlockedRowIds,
      lastStudied: after.lastStudied,
    }).toEqual(progressBefore)

    for (const card of activityCards()) {
      expect(card).not.toHaveAttribute('aria-disabled')
      expect(card.tagName).toBe('A')
    }
  })

  it('does not show again after dismissal or on another category', () => {
    const first = renderHub()
    fireEvent.click(first.getByText(content.dismissLabel))
    first.unmount()

    expect(renderHub().queryByTestId('sokuon-guide')).toBeNull()
    expect(renderHub('hiragana', 'a-row').queryByTestId('sokuon-guide')).toBeNull()
  })

  it('stops narration when the guide unmounts', () => {
    const hub = renderHub()
    hub.unmount()
    expect(tts.stop).toHaveBeenCalled()
  })
})
