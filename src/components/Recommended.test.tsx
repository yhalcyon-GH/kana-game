import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecommendedFrame, RecommendedLabel } from './Recommended'

describe('Recommended (Issue #21)', () => {
  it('RecommendedLabel renders "⭐ Recommended" styled bold/red', () => {
    const { getByText } = render(<RecommendedLabel />)
    const el = getByText('⭐ Recommended')
    expect(el).toHaveClass('font-bold')
    expect(el.className).toMatch(/text-red-600/)
  })

  it('RecommendedFrame renders its children plus two static sparkle decorations', () => {
    const { getByText, getAllByText } = render(
      <RecommendedFrame>
        <span>content</span>
      </RecommendedFrame>,
    )
    expect(getByText('content')).toBeInTheDocument()
    expect(getAllByText('✨')).toHaveLength(2)
  })
})
