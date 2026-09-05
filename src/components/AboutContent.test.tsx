import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AboutContent } from './AboutContent'

// AboutPage.test.tsx and SettingsPage.test.tsx both exercise this same
// component through their respective pages — this file covers the
// component directly so its contract doesn't rely on either call site.
describe('AboutContent', () => {
  it('renders the About heading', () => {
    render(
      <MemoryRouter>
        <AboutContent />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'About', level: 1 })).toBeInTheDocument()
  })

  it('shows the exact required intro sentence', () => {
    render(
      <MemoryRouter>
        <AboutContent />
      </MemoryRouter>,
    )
    expect(
      screen.getByText(
        'Tamamizu: Hiragana & Katakana was created by a Japanese language teacher. AI was used to create the audio and illustrations. All learning content and audio were created and reviewed by a Japanese language teacher.',
      ),
    ).toBeInTheDocument()
  })

  it('mentions Azure AI Speech and ElevenLabs as the audio providers, with no human-recording claim', () => {
    render(
      <MemoryRouter>
        <AboutContent />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Microsoft Azure AI Speech/)).toBeInTheDocument()
    expect(screen.getByText(/ElevenLabs/)).toBeInTheDocument()
    const bodyText = document.body.textContent ?? ''
    expect(bodyText).not.toMatch(/real human speech/i)
    expect(bodyText).not.toMatch(/real recordings?/i)
  })

  it('links to Privacy Policy and Third-Party Notices routes (not inlined legal text)', () => {
    render(
      <MemoryRouter>
        <AboutContent />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Third-Party Notices' })).toHaveAttribute('href', '/third-party-notices')
  })

  it('shows a build identifier and hides Send Feedback when unconfigured', () => {
    render(
      <MemoryRouter>
        <AboutContent />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Build:/)).toBeInTheDocument()
    expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument()
  })
})
