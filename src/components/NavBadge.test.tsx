import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NavBadge } from './NavBadge'

describe('NavBadge', () => {
  it('renders nothing at 0', () => {
    const { container } = render(<NavBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a negative count', () => {
    const { container } = render(<NavBadge count={-1} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the exact number for 1-99', () => {
    render(<NavBadge count={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('shows 99+ for counts over 99', () => {
    render(<NavBadge count={100} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('shows exactly 99 at the boundary, not 99+', () => {
    render(<NavBadge count={99} />)
    expect(screen.getByText('99')).toBeInTheDocument()
  })
})
