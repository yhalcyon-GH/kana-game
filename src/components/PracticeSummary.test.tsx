import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PracticeSummary } from './PracticeSummary'

// Exposes the MemoryRouter's current pathname as text so a test can assert
// on it directly — window.location.pathname is not updated by MemoryRouter,
// so that global is not a reliable way to observe in-app navigation here.
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

// Item 9: Play Again / Continue order and styling.
describe('PracticeSummary Play Again / Continue order (Item 9)', () => {
  function renderSummary(continueAction?: { label: string; to: string }) {
    return render(
      <MemoryRouter>
        <PracticeSummary
          title="Session complete!"
          stats={[{ label: 'Correct', value: 5 }]}
          backHref="/practice/hiragana/a-row"
          onRetry={() => {}}
          continueAction={continueAction}
        />
      </MemoryRouter>,
    )
  }

  it('when both actions exist, Play Again precedes Continue in literal DOM order', () => {
    const { getByText } = renderSummary({ label: 'Continue', to: '/practice/hiragana/a-row/kana-quiz' })
    const playAgain = getByText('Play Again')
    const cont = getByText('Continue')
    expect(playAgain.compareDocumentPosition(cont) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  it('Continue is styled primary (blue) and Play Again secondary when both are present', () => {
    const { getByText } = renderSummary({ label: 'Continue', to: '/practice/hiragana/a-row/kana-quiz' })
    expect(getByText('Continue')).toHaveClass('bg-blue-600')
    expect(getByText('Play Again')).not.toHaveClass('bg-blue-600')
    expect(getByText('Play Again')).toHaveClass('border-neutral-300')
  })

  it('with no continue action, Play again remains primary (blue)', () => {
    const { getByText } = renderSummary(undefined)
    expect(getByText('Play again')).toHaveClass('bg-blue-600')
  })

  it('other summary actions (Back to hub) are unaffected', () => {
    const { getByText } = renderSummary({ label: 'Continue', to: '/practice/hiragana/a-row/kana-quiz' })
    expect(getByText('Back to hub')).toHaveAttribute('href', '/practice/hiragana/a-row')
  })

  it('Retry mistakes button still renders alongside the reordered pair when mistakes exist', () => {
    const { getByText } = render(
      <MemoryRouter>
        <PracticeSummary
          title="Session complete!"
          stats={[{ label: 'Correct', value: 3 }]}
          backHref="/practice/hiragana/a-row"
          onRetry={() => {}}
          continueAction={{ label: 'Continue', to: '/practice/hiragana/a-row/kana-quiz' }}
          mistakes={[{ id: 'a', kana: 'あ', romaji: 'a' }]}
          onRetryMistakes={() => {}}
        />
      </MemoryRouter>,
    )
    expect(getByText('Retry')).toBeInTheDocument()
    expect(getByText('Play Again')).toBeInTheDocument()
    expect(getByText('Continue')).toBeInTheDocument()
  })
})

// Retry button label is a plain "Retry" (no mistake count in the text —
// see PR "fix: polish practice summary buttons"). This immediate
// same-round retry is distinct from the persistent, cross-session global
// Review feature. Behavior (which callback fires, and that it only covers
// this round's distinct mistakes) is unchanged — only the label/styling
// changed.
describe('PracticeSummary Retry mistakes button (retry vs Review clarity)', () => {
  function renderWithMistakes(mistakeCount: number, onRetryMistakes = () => {}) {
    const mistakes = Array.from({ length: mistakeCount }, (_, i) => ({
      id: `m${i}`,
      kana: 'あ',
      romaji: 'a',
    }))
    return render(
      <MemoryRouter>
        <PracticeSummary
          title="Session complete!"
          stats={[{ label: 'Correct', value: 3 }]}
          backHref="/practice/hiragana/a-row"
          onRetry={() => {}}
          mistakes={mistakes}
          onRetryMistakes={onRetryMistakes}
        />
      </MemoryRouter>,
    )
  }

  it('renders exactly "Retry" regardless of mistake count', () => {
    const { getByText, queryByText } = renderWithMistakes(1)
    expect(getByText('Retry')).toBeInTheDocument()
    expect(queryByText('Retry 1 mistake')).toBeNull()
    expect(queryByText('Review 1 mistake')).toBeNull()
  })

  it('does not include the mistake count in the button text for multiple mistakes', () => {
    const { getByText, queryByText } = renderWithMistakes(3)
    expect(getByText('Retry')).toBeInTheDocument()
    expect(queryByText('Retry 3 mistakes')).toBeNull()
    expect(queryByText('Review 3 mistakes')).toBeNull()
  })

  it('Retry button is styled green, not amber', () => {
    const { getByText } = renderWithMistakes(2)
    const retryButton = getByText('Retry')
    expect(retryButton).toHaveClass('bg-green-600')
    expect(retryButton).not.toHaveClass('bg-amber-500')
  })

  it('clicking Retry invokes onRetryMistakes and does not navigate to the global Review route', () => {
    const onRetryMistakes = vi.fn()
    const mistakes = Array.from({ length: 2 }, (_, i) => ({ id: `m${i}`, kana: 'あ', romaji: 'a' }))
    const { getByText, getByTestId } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row/kana-quiz']}>
        <PracticeSummary
          title="Session complete!"
          stats={[{ label: 'Correct', value: 3 }]}
          backHref="/practice/hiragana/a-row"
          onRetry={() => {}}
          mistakes={mistakes}
          onRetryMistakes={onRetryMistakes}
        />
        <LocationProbe />
      </MemoryRouter>,
    )

    expect(getByTestId('location-probe')).toHaveTextContent('/practice/hiragana/a-row/kana-quiz')

    fireEvent.click(getByText('Retry'))

    expect(onRetryMistakes).toHaveBeenCalledTimes(1)
    expect(getByTestId('location-probe')).toHaveTextContent('/practice/hiragana/a-row/kana-quiz')
  })
})

// Graded Practice (Kana Quiz, Listening, Word Builder, Kana Typing) shows
// Tamamizu + an explicit Japanese correct-answer count instead of an
// Accuracy percentage — see "fix: improve practice result summary".
describe('PracticeSummary graded result (score image + X/Y score)', () => {
  function renderGraded(overrides: Partial<Parameters<typeof PracticeSummary>[0]> = {}) {
    return render(
      <MemoryRouter>
        <PracticeSummary
          title="Kana Quiz complete!"
          backHref="/practice/hiragana/a-row"
          onRetry={() => {}}
          score={{ correct: 7, total: 8 }}
          {...overrides}
        />
      </MemoryRouter>,
    )
  }

  it('renders the score exactly as "{correct}/{total}"', () => {
    const { getByText } = renderGraded({ score: { correct: 6, total: 8 } })
    expect(getByText('6/8')).toBeInTheDocument()
  })

  it('renders a perfect score exactly as "8/8"', () => {
    const { getByText } = renderGraded({ score: { correct: 8, total: 8 } })
    expect(getByText('8/8')).toBeInTheDocument()
  })

  it('renders a 15-question score exactly as "11/15"', () => {
    const { getByText } = renderGraded({ score: { correct: 11, total: 15 } })
    expect(getByText('11/15')).toBeInTheDocument()
  })

  it('never shows the old "{total}問中{correct}問正解" text, an Accuracy percentage, or encouragement comment text', () => {
    const { container, queryByText } = renderGraded()
    expect(queryByText(/問中/)).toBeNull()
    expect(queryByText(/問正解/)).toBeNull()
    expect(queryByText(/その調子/)).toBeNull()
    expect(queryByText(/Accuracy/i)).toBeNull()
    expect(queryByText(/%/)).toBeNull()
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+\s*correct/i)
  })

  it('shows a result image in the result row, directly below the title', () => {
    const { container } = renderGraded()
    const heading = container.querySelector('h2')!
    const resultImg = container.querySelector('img')
    expect(resultImg).not.toBeNull()
    expect(container.textContent).toContain('7/8')
    expect(heading.compareDocumentPosition(resultImg!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  it('the result image appears exactly once, not duplicated below the action buttons', () => {
    const { container } = renderGraded()
    expect(container.querySelectorAll('img').length).toBe(1)
  })

  it.each([
    [{ correct: 0, total: 8 }, 'summary-result-1.webp'], // 0% -> band 1
    [{ correct: 1, total: 8 }, 'summary-result-1.webp'], // 12.5% -> band 1
    [{ correct: 2, total: 8 }, 'summary-result-2.webp'], // 25% -> band 2
    [{ correct: 3, total: 8 }, 'summary-result-2.webp'], // 37.5% -> band 2
    [{ correct: 4, total: 8 }, 'summary-result-3.webp'], // 50% -> band 3
    [{ correct: 5, total: 8 }, 'summary-result-3.webp'], // 62.5% -> band 3
    [{ correct: 6, total: 8 }, 'summary-result-4.webp'], // 75% -> band 4
    [{ correct: 7, total: 8 }, 'summary-result-4.webp'], // 87.5% -> band 4
    [{ correct: 8, total: 8 }, 'summary-result-5.webp'], // 100% -> band 5
  ])('selects %o -> %s', (score, expectedFile) => {
    const { container } = renderGraded({ score })
    const resultImg = container.querySelector('img') as HTMLImageElement
    expect(resultImg.src).toContain(expectedFile)
  })

  it('generic stats still render when score is not supplied (ungraded flows like Tracing)', () => {
    const { getByText, container } = render(
      <MemoryRouter>
        <PracticeSummary
          title="Tracing complete!"
          stats={[{ label: 'Characters traced', value: 5 }]}
          backHref="/practice/hiragana/a-row"
          onRetry={() => {}}
        />
      </MemoryRouter>,
    )
    expect(getByText('Characters traced')).toBeInTheDocument()
    expect(getByText('5')).toBeInTheDocument()
    expect(container.querySelectorAll('img').length).toBe(0)
  })
})
