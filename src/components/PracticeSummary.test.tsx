import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PracticeSummary } from './PracticeSummary'

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

  it('Review mistakes button still renders alongside the reordered pair when mistakes exist', () => {
    const { getByText } = render(
      <MemoryRouter>
        <PracticeSummary
          title="Session complete!"
          stats={[{ label: 'Correct', value: 3 }]}
          backHref="/practice/hiragana/a-row"
          onRetry={() => {}}
          continueAction={{ label: 'Continue', to: '/practice/hiragana/a-row/kana-quiz' }}
          mistakes={[{ id: 'a', kana: 'あ', romaji: 'a' }]}
          onReviewMistakes={() => {}}
        />
      </MemoryRouter>,
    )
    expect(getByText('Review 1 mistake')).toBeInTheDocument()
    expect(getByText('Play Again')).toBeInTheDocument()
    expect(getByText('Continue')).toBeInTheDocument()
  })
})
