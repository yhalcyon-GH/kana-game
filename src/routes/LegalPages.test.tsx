import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { RefundPage } from './RefundPage'
import { SupportPage } from './SupportPage'
import { TermsPage } from './TermsPage'

function renderWithRouter(element: ReactElement) {
  render(<MemoryRouter>{element}</MemoryRouter>)
}

describe('SupportPage', () => {
  it('publishes the dedicated private support contact and secret-handling guidance', () => {
    renderWithRouter(<SupportPage />)
    expect(screen.getByRole('heading', { name: 'Support & Contact', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'tamamizu.jp@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:tamamizu.jp@gmail.com',
    )
    expect(screen.getByText(/Do not send payment-card details/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terms & Conditions' })).toHaveAttribute('href', '/terms')
  })
})

describe('RefundPage', () => {
  it('publishes the decided 14-day, full-refund policy without a digital-content waiver', () => {
    renderWithRouter(<RefundPage />)
    expect(screen.getByRole('heading', { name: 'Refund Policy', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/within 14 calendar days/i)).toBeInTheDocument()
    expect(screen.getByText(/does not ask you to waive this refund period/i)).toBeInTheDocument()
    expect(screen.getByText(/does not ordinarily offer partial refunds/i)).toBeInTheDocument()
  })

  it('describes the implemented pending, approved, and rejected access states', () => {
    renderWithRouter(<RefundPage />)
    const section = screen.getByRole('heading', { name: 'Processing and paid access', level: 2 }).parentElement?.textContent ?? ''
    expect(section).toMatch(/pending Paddle approval, paid access remains available/)
    expect(section).toMatch(/full refund is approved, Full Tamamizu access ends/)
    expect(section).toMatch(/request is rejected, paid access remains active or is restored/)
  })
})

describe('TermsPage', () => {
  it('publishes the decided Thai law, Thai courts, and consumer-rights savings clause', () => {
    renderWithRouter(<TermsPage />)
    expect(screen.getByRole('heading', { name: 'Terms & Conditions', level: 1 })).toBeInTheDocument()
    const disputes = screen.getByRole('heading', { name: 'Governing law and disputes', level: 2 }).parentElement?.textContent ?? ''
    expect(disputes).toMatch(/laws of Thailand/)
    expect(disputes).toMatch(/courts of Thailand that have jurisdiction/)
    expect(disputes).toMatch(/consumer protection right or remedy/)
  })
})
