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
