import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntitlementContext, type EntitlementState } from '../components/EntitlementContext'
import { ROWS } from '../data/curriculum'
import { PRACTICE_CHECKPOINTS } from '../data/practiceCheckpoints'
import { useProgressStore } from '../store/progressStore'
import { HomePage } from './HomePage'
import { CategoryRowsPage } from './CategoryRowsPage'

vi.mock('../hooks/useTTS', () => {
  const tts = { speak: vi.fn(), stop: vi.fn() }
  return { useTTS: () => tts }
})

const user = { userId: 'learner', emailNormalized: 'learner@example.com' }
const deniedStates: EntitlementState[] = [
  { status: 'signed-out', user: null },
  { status: 'loading', user: null },
  { status: 'inactive', user },
  { status: 'unavailable', user },
]
const active: EntitlementState = { status: 'active', user }
const refresh = vi.fn().mockResolvedValue(undefined)

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function fixture(children: ReactNode, state: EntitlementState) {
  return <MemoryRouter><EntitlementContext.Provider value={{ state, refresh, markSignedOut: vi.fn() }}>{children}<Location /></EntitlementContext.Provider></MemoryRouter>
}

function completeHiragana() {
  for (const row of ROWS.filter((row) => row.categoryId === 'hiragana' && !row.isSummary)) {
    useProgressStore.getState().markRowTaught(row.id)
    for (const activity of ['kanaQuiz', 'listening', 'wordBuilder'] as const) {
      useProgressStore.getState().markRowActivityCompleted(row.id, activity)
    }
    if (PRACTICE_CHECKPOINTS.some((checkpoint) => checkpoint.afterRowId === row.id)) {
      useProgressStore.getState().markRowActivityCompleted(row.id, 'checkpoint')
    }
  }
  useProgressStore.getState().markAssessmentCompleted('hiragana', { correct: 20, total: 20 })
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  refresh.mockClear()
})

describe('commercial navigation', () => {
  describe.each([
    { categoryIds: ['sokuon', 'chouon'], guide: 'sokuon-guide' },
    { categoryIds: ['sokuon', 'chouon'], guide: 'chouon-guide' },
    { categoryIds: ['youon', 'special-katakana'], guide: 'youon-guide' },
  ])('$guide automatic content', ({ categoryIds, guide }) => {
    it.each(deniedStates)('does not mount or complete while $status, restores only when active', (state) => {
      useProgressStore.getState().setHasCompletedIntroGuide(true)
      if (guide === 'chouon-guide') {
        useProgressStore.getState().setHasCompletedSokuonGuide(true)
        useProgressStore.getState().markRowTaught('sokuon-row')
        for (const activity of ['listening', 'wordBuilder', 'checkpoint'] as const) {
          useProgressStore.getState().markRowActivityCompleted('sokuon-row', activity)
        }
      }
      const before = JSON.stringify(useProgressStore.getState())
      const page = <CategoryRowsPage title="Paid section" description="" categoryIds={categoryIds} />
      const view = render(fixture(page, state))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(JSON.stringify(useProgressStore.getState())).toBe(before)

      view.rerender(fixture(page, active))
      expect(screen.getByTestId(guide)).toHaveAttribute('role', 'dialog')
      view.rerender(fixture(page, state))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(JSON.stringify(useProgressStore.getState())).toBe(before)
    })
  })

  it.each(deniedStates)('preserves manual Hiragana intro replay with Intro completed while $status', (state) => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    const before = JSON.stringify(useProgressStore.getState())
    render(fixture(<CategoryRowsPage title="Hiragana" description="" categoryIds={['hiragana']} askTamamizuKanaIntroVariant="hiragana" />, state))
    fireEvent.click(screen.getByTestId('ask-tamamizu-hiragana'))
    expect(screen.getByTestId('kana-intro-excerpt-guide')).toHaveAttribute('role', 'dialog')
    expect(JSON.stringify(useProgressStore.getState())).toBe(before)
  })

  it.each(deniedStates)('keeps paid Home recommendation and Continue visible without paid navigation while $status', (state) => {
    completeHiragana()
    useProgressStore.getState().setLastStudied({ categoryId: 'katakana', rowId: 'katakana-a-row', activity: 'learn' })
    const before = JSON.stringify(useProgressStore.getState())
    const view = render(fixture(<HomePage />, state))
    const recommendation = screen.getByRole('button', { name: /Katakana.*Recommended/ })
    expect(recommendation).toHaveTextContent('ア〜オ・カ〜ゴ・ン・ー · Learn')
    expect(recommendation).toHaveTextContent('Full Access')
    expect(screen.getAllByRole('button', { name: /Full Access/ })).toHaveLength(4)
    const resume = screen.getByRole('button', { name: /Katakana.*Continue/ })
    expect(resume).toHaveTextContent('ア〜オ')
    expect(screen.getByRole('link', { name: /Hiragana/ })).toHaveAttribute('href', '/hiragana')
    fireEvent.click(resume)
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    expect(screen.getByRole('region', { name: 'Full Access' })).toBeInTheDocument()
    if (state.status === 'unavailable') {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(refresh).toHaveBeenCalledOnce()
    }
    view.rerender(fixture(<HomePage />, active))
    expect(screen.getByRole('link', { name: /Katakana.*Recommended/ })).toHaveAttribute('href', '/katakana')
    expect(screen.getByRole('link', { name: /Continue/ })).toHaveAttribute('href', '/practice/katakana/katakana-a-row')
    expect(JSON.stringify(useProgressStore.getState())).toBe(before)
  })

  it.each(deniedStates)('locks paid row, summary, similar-letter, checkpoint and assessment cards while $status', (state) => {
    completeHiragana()
    const page = <CategoryRowsPage title="Katakana" description="" categoryIds={['katakana']} />
    const view = render(fixture(page, state))
    expect(screen.queryByRole('link', { name: /ア〜オ/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ア〜オ.*Full Access/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /📋 ア〜ン.*Full Access/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Similar Letters.*Full Access/ })).toBeInTheDocument()
    const controls = [...screen.getAllByTestId('restaurant-cta'), screen.getByTestId('cafe-cta'), screen.getByTestId('assessment-card-katakana')]
    for (const control of controls) {
      expect(control.tagName).toBe('BUTTON')
      expect(control).toHaveTextContent('Full Access')
      fireEvent.click(control)
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    }
    view.rerender(fixture(page, active))
    expect(screen.getByRole('link', { name: /ア〜オ/ })).toHaveAttribute('href', '/practice/katakana/katakana-a-row')
    expect(screen.getByTestId('assessment-card-katakana')).toHaveAttribute('href', '/assessment/katakana')
    fireEvent.click(screen.getByTestId('cafe-cta'))
    expect(screen.getByTestId('location')).toHaveTextContent('/cafe/katakana-ha-row')
  })

  it.each(deniedStates)('keeps Hiragana row, assessment and checkpoints accessible while $status', (state) => {
    render(fixture(<CategoryRowsPage title="Hiragana" description="" categoryIds={['hiragana']} />, state))
    expect(screen.getByRole('link', { name: /あ〜お/ })).toHaveAttribute('href', '/practice/hiragana/a-row')
    expect(screen.getByTestId('assessment-card-hiragana')).toHaveAttribute('href', '/assessment/hiragana')
    const checkpoint = screen.getAllByTestId('restaurant-cta')[0]
    expect(within(checkpoint).queryByText('Full Access')).not.toBeInTheDocument()
    fireEvent.click(checkpoint)
    expect(screen.getByTestId('location')).toHaveTextContent('/restaurant/na-row')
  })
})
