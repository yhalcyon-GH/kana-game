import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { GojuonRow } from '../data/types'
import { RowMap } from './RowMap'

const row: GojuonRow = {
  id: 'a-row',
  categoryId: 'hiragana',
  label: 'あ行',
  order: 0,
  characterIds: ['a', 'i', 'u', 'e', 'o'],
}

function renderRowMap(isMastered: (rowId: string) => boolean) {
  return render(
    <MemoryRouter>
      <RowMap rows={[row]} isUnlocked={() => true} isTaught={() => true} isMastered={isMastered} />
    </MemoryRouter>,
  )
}

describe('RowMap mastery badge (Issue #13)', () => {
  it('shows 👍, not 🌟, for a mastered row', () => {
    const { queryByText } = renderRowMap(() => true)
    expect(queryByText('👍')).not.toBeNull()
    expect(queryByText(/🌟/)).toBeNull()
    expect(queryByText(/mastered/i)).toBeNull()
  })

  it('does not show 👍 for a taught-but-not-mastered row', () => {
    const { queryByText } = renderRowMap(() => false)
    expect(queryByText('👍')).toBeNull()
    expect(queryByText('📗 learned')).not.toBeNull()
  })
})

describe('RowMap Recommended row (Issue #25)', () => {
  it('shows the Recommended label on a row isRecommended flags true', () => {
    const { queryByText } = render(
      <MemoryRouter>
        <RowMap
          rows={[row]}
          isUnlocked={() => true}
          isTaught={() => true}
          isMastered={() => false}
          isRecommended={() => true}
        />
      </MemoryRouter>,
    )
    expect(queryByText('⭐ Recommended')).not.toBeNull()
  })

  it('shows no Recommended label when isRecommended is false or omitted', () => {
    const { queryByText } = render(
      <MemoryRouter>
        <RowMap
          rows={[row]}
          isUnlocked={() => true}
          isTaught={() => true}
          isMastered={() => false}
          isRecommended={() => false}
        />
      </MemoryRouter>,
    )
    expect(queryByText('⭐ Recommended')).toBeNull()

    const { queryByText: queryOmitted } = render(
      <MemoryRouter>
        <RowMap rows={[row]} isUnlocked={() => true} isTaught={() => true} isMastered={() => false} />
      </MemoryRouter>,
    )
    expect(queryOmitted('⭐ Recommended')).toBeNull()
  })
})

describe('RowMap row-selection presentation (Issue #38)', () => {
  const groupedRow: GojuonRow = {
    ...row,
    id: 'ka-row',
    label: 'か〜こ・が〜ご',
    displayLines: ['か〜こ', 'が〜ご'],
  }

  it('renders each configured learning group on its own non-wrapping line', () => {
    const { getByText } = render(
      <MemoryRouter>
        <RowMap rows={[groupedRow]} isUnlocked={() => true} isTaught={() => false} isMastered={() => false} />
      </MemoryRouter>,
    )

    for (const line of groupedRow.displayLines!) {
      expect(getByText(line)).toHaveClass('block', 'whitespace-nowrap')
    }
  })

  it('keeps a single-group row on the normal one-line fallback', () => {
    const { getByText } = renderRowMap(() => false)
    expect(getByText(row.label)).toHaveClass('font-kana', 'text-lg')
    expect(getByText(row.label).children).toHaveLength(0)
  })

  it('makes the whole unlocked card one native link and removes Open', () => {
    const { getByRole, queryByText } = render(
      <MemoryRouter>
        <RowMap
          rows={[groupedRow]}
          isUnlocked={() => true}
          isTaught={() => false}
          isMastered={() => false}
          isRecommended={() => true}
        />
      </MemoryRouter>,
    )

    const link = getByRole('link')
    expect(link).toHaveAttribute('href', '/practice/hiragana/ka-row')
    expect(link).toHaveClass('focus-visible:ring-4')
    expect(link).toHaveTextContent('か〜こが〜ご')
    expect(link).toHaveTextContent('⭐ Recommended')
    expect(queryByText('Open')).toBeNull()
    expect(link.querySelectorAll('a,button')).toHaveLength(0)
  })

  it('keeps a locked card non-interactive and non-navigable', () => {
    const { queryByRole, getByText } = render(
      <MemoryRouter>
        <RowMap rows={[groupedRow]} isUnlocked={() => false} isTaught={() => false} isMastered={() => false} />
      </MemoryRouter>,
    )

    expect(queryByRole('link')).toBeNull()
    expect(queryByRole('button')).toBeNull()
    expect(getByText('🔒 locked')).toBeInTheDocument()
  })
})

describe('RowMap Summary card icon', () => {
  const summaryRow: GojuonRow = { ...row, id: 'summary-row', isSummary: true }
  const similarLettersRow: GojuonRow = { ...row, id: 'similar-row', isSimilarLetters: true }

  it('shows 📋 (not ⭐) for a Summary row', () => {
    const { container } = render(
      <MemoryRouter>
        <RowMap rows={[summaryRow]} isUnlocked={() => true} isTaught={() => true} isMastered={() => false} />
      </MemoryRouter>,
    )
    const kanaLabel = container.querySelector('.font-kana')!
    expect(kanaLabel.textContent).toContain('📋')
    expect(kanaLabel.textContent).not.toContain('⭐')
  })

  it('leaves Similar Letters\' 🔍 icon unaffected', () => {
    const { container } = render(
      <MemoryRouter>
        <RowMap rows={[similarLettersRow]} isUnlocked={() => true} isTaught={() => true} isMastered={() => false} />
      </MemoryRouter>,
    )
    const kanaLabel = container.querySelector('.font-kana')!
    expect(kanaLabel.textContent).toContain('🔍')
  })

  it('keeps the Recommended ⭐ label intact and unaffected by the Summary icon change', () => {
    const { getByText } = render(
      <MemoryRouter>
        <RowMap
          rows={[summaryRow]}
          isUnlocked={() => true}
          isTaught={() => true}
          isMastered={() => false}
          isRecommended={() => true}
        />
      </MemoryRouter>,
    )
    expect(getByText('⭐ Recommended')).toBeInTheDocument()
  })
})
