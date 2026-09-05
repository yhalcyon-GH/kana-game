import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AboutPage } from './AboutPage'

describe('AboutPage', () => {
  it('links to the Privacy Policy and Third-Party Notices routes', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Third-Party Notices' })).toHaveAttribute('href', '/third-party-notices')
  })

  it('does not show the Send Feedback entry when no feedback URL is configured', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument()
  })

  it('shows a build identifier', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Build:/)).toBeInTheDocument()
  })

  it("describes the app's real audio providers (not ElevenLabs-only)", () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Microsoft Azure AI Speech/)).toBeInTheDocument()
    expect(screen.getByText(/ElevenLabs/)).toBeInTheDocument()
  })
})
