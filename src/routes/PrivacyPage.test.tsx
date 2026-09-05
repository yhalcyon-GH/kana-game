import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

describe('PrivacyPage', () => {
  it('renders the Privacy Policy heading', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeInTheDocument()
  })

  it('discloses local-storage-only progress data and no accounts', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/No accounts/i)).toBeInTheDocument()
    expect(screen.getAllByText(/local storage/i).length).toBeGreaterThan(0)
  })

  it('accurately states no third-party analytics service is currently active', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Analytics', level: 2 })
    expect(heading.parentElement?.textContent).toMatch(/not.*sent to any third-party analytics service/)
  })

  it('describes speech recognition as browser-handled, not server-recorded', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/Web Speech API/)).toBeInTheDocument()
    expect(screen.getByText(/does not record, upload, or store your voice audio/i)).toBeInTheDocument()
  })
})
