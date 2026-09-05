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

  it('shows the exact required intro sentence, verbatim', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByText(
        'Tamamizu: Hiragana & Katakana was created by a Japanese language teacher. AI was used to create the audio and illustrations. All learning content and audio were created and reviewed by a Japanese language teacher.',
      ),
    ).toBeInTheDocument()
  })

  it('does not claim any audio is real human speech/recordings (all audio is AI-generated per the current distribution)', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    const bodyText = document.body.textContent ?? ''
    expect(bodyText).not.toMatch(/real human speech/i)
    expect(bodyText).not.toMatch(/real recordings?/i)
    expect(bodyText).not.toMatch(/human recording/i)
    expect(bodyText).not.toMatch(/recorded pronunciation/i)
  })
})
