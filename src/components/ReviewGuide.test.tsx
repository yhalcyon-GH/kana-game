import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REVIEW_GUIDE_CONTENT, DEFAULT_REVIEW_GUIDE_LOCALE } from '../data/reviewGuideContent'
import { useProgressStore } from '../store/progressStore'
import { GuideHighlightProvider } from './GuideHighlightProvider'
import { NavBar } from './NavBar'
import { PracticeSummary } from './PracticeSummary'

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))

vi.mock('../hooks/useTTS', () => ({ useTTS: () => tts }))

const content = REVIEW_GUIDE_CONTENT[DEFAULT_REVIEW_GUIDE_LOCALE]

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  useProgressStore.getState().setHasCompletedIntroGuide(true)
  tts.speak.mockReset()
  tts.stop.mockReset()
})

function renderSummary(path = '/practice/hiragana/a-row/kana-quiz') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GuideHighlightProvider>
        <NavBar />
        <PracticeSummary title="Complete" stats={[]} backHref="/practice/hiragana/a-row" onRetry={vi.fn()} />
      </GuideHighlightProvider>
    </MemoryRouter>,
  )
}

function createFirstReviewTarget() {
  useProgressStore.getState().markRowTaught('a-row')
  useProgressStore.getState().recordCharacterReviewResult('a', false)
}

describe('Review Guide (Issue #40)', () => {
  it('does not appear on a summary before anything needs Review', () => {
    const summary = renderSummary()
    expect(summary.queryByTestId('review-guide')).toBeNull()
    expect(tts.speak).not.toHaveBeenCalled()
  })

  it('appears on the next non-Review summary and highlights Review in orange', () => {
    createFirstReviewTarget()
    const summary = renderSummary()

    expect(summary.getByTestId('review-guide')).toBeInTheDocument()
    expect(summary.getByRole('img', { name: 'Tamamizu explains Review' })).toHaveAttribute('src', '/guide/review-guide.webp')
    expect(summary.queryByText(content.speechText)).toBeNull()
    expect(tts.speak).toHaveBeenCalledWith(content.audioKey, content.speechText, content.lang)

    const reviewLink = summary.getByRole('link', { name: /Review\s*1/ })
    expect(reviewLink).toHaveClass('text-orange-600', 'ring-orange-400')
    expect(reviewLink.querySelector('span')).toHaveClass('bg-orange-500', 'ring-orange-300')
  })

  it('dismisses without navigating or changing the Review target', () => {
    createFirstReviewTarget()
    const before = useProgressStore.getState().characters.a
    const summary = renderSummary()

    fireEvent.click(summary.getByText(content.dismissLabel))

    expect(summary.queryByTestId('review-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedReviewGuide).toBe(true)
    expect(useProgressStore.getState().characters.a).toEqual(before)
    expect(tts.stop).toHaveBeenCalled()
  })

  it('does not appear again after dismissal', () => {
    createFirstReviewTarget()
    useProgressStore.getState().setHasCompletedReviewGuide(true)
    expect(renderSummary().queryByTestId('review-guide')).toBeNull()
  })

  it('does not appear inside Review itself', () => {
    createFirstReviewTarget()
    expect(renderSummary('/practice/review/kana-quiz').queryByTestId('review-guide')).toBeNull()
  })
})
