import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThirdPartyNoticesPage } from './ThirdPartyNoticesPage'

describe('ThirdPartyNoticesPage', () => {
  it('renders the Third-Party Notices heading', () => {
    render(<ThirdPartyNoticesPage />)
    expect(screen.getByRole('heading', { name: 'Third-Party Notices', level: 1 })).toBeInTheDocument()
  })

  it('lists strokesvg and Klee One with license links', () => {
    render(<ThirdPartyNoticesPage />)
    expect(screen.getAllByText(/strokesvg/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Klee One/).length).toBeGreaterThan(0)
    const licenseLinks = screen.getAllByRole('link', { name: /Full license text/ })
    expect(licenseLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('lists the bundled runtime software packages', () => {
    render(<ThirdPartyNoticesPage />)
    expect(screen.getAllByText(/React/).length).toBeGreaterThan(0)
    expect(screen.getByText(/React Router/)).toBeInTheDocument()
    expect(screen.getByText(/Zustand/)).toBeInTheDocument()
    expect(screen.getAllByText(/Workbox/).length).toBeGreaterThan(0)
  })
})
