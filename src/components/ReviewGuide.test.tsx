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

  // Retry (this-round-only) vs Review (persistent, cross-session) are easy
  // for beginners to conflate since both used to be labeled "Review" — the
  // guide now spells out the difference in visible DOM copy. This is
  // separate from, and never passed to, the spoken narration below.
  it('explains Retry and Review as distinct concepts in visible copy', () => {
    createFirstReviewTarget()
    const summary = renderSummary()

    expect(summary.getByText('Retry')).toBeInTheDocument()
    expect(summary.getByText("Practice this round's mistakes.")).toBeInTheDocument()
    expect(summary.getByText('Practice saved kana and words anytime.')).toBeInTheDocument()
  })

  it('styles the Retry legend green, not amber', () => {
    createFirstReviewTarget()
    const summary = renderSummary()

    const retryTerm = summary.getByText('Retry')
    expect(retryTerm).toHaveClass('text-green-600', 'dark:text-green-400')
    expect(retryTerm).not.toHaveClass('text-amber-600', 'dark:text-amber-400')
  })

  it('never passes the new visible Retry/Review explanation copy to speech', () => {
    createFirstReviewTarget()
    renderSummary()

    expect(tts.speak).toHaveBeenCalledTimes(1)
    const [, spokenText] = tts.speak.mock.calls[0]
    expect(spokenText).toBe(content.speechText)
    expect(spokenText).not.toContain("Practice this round's mistakes.")
    expect(spokenText).not.toContain('Practice saved kana and words anytime.')
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
