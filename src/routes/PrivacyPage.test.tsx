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

  it('describes speech recognition as browser/platform-handled, not server-recorded, and notes that provider\'s own terms apply', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/Web Speech API/)).toBeInTheDocument()
    expect(screen.getByText(/does not record, upload, or store your microphone audio/i)).toBeInTheDocument()
    const heading = screen.getByRole('heading', { name: 'Microphone / speech recognition', level: 2 })
    expect(heading.parentElement?.textContent).toMatch(/browser or platform provider's own privacy terms/)
  })

  it('identifies the developer/operator using only public GitHub identity, no private info', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('link', { name: 'yhalcyon-GH' })).toHaveAttribute('href', 'https://github.com/yhalcyon-GH')
    expect(screen.getByRole('link', { name: 'kana-game' })).toHaveAttribute('href', 'https://github.com/yhalcyon-GH/kana-game')
    expect(screen.queryByText(/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)).not.toBeInTheDocument()
  })

  it('provides a GitHub issues contact mechanism for privacy inquiries', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('link', { name: /github\.com\/yhalcyon-GH\/kana-game\/issues/ })).toHaveAttribute(
      'href',
      'https://github.com/yhalcyon-GH/kana-game/issues',
    )
  })

  it('discloses that the static host may process ordinary request metadata under its own terms', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Hosting', level: 2 })
    expect(heading.parentElement?.textContent).toMatch(/hosting provider/)
    expect(heading.parentElement?.textContent).toMatch(/provider's own privacy terms/)
  })
})
