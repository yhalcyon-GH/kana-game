import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as trackModule from '../lib/analytics/track'
import { SendFeedback } from './SendFeedback'

// VITE_FEEDBACK_URL is unset in this release (no feedback provider is
// configured — see docs/analytics-foundation.md), so SendFeedback must
// render nothing at all: never a broken link, never a fake submit button.
describe('SendFeedback', () => {
  it('renders nothing when no feedback URL is configured', () => {
    const { container } = render(
      <MemoryRouter>
        <SendFeedback />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument()
  })
})

describe('SendFeedback with a destination configured', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('renders a normal link (not a window.open()-driven button) pointing at the configured destination', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://forms.example.com/kana-game-feedback')

    render(
      <MemoryRouter initialEntries={['/about']}>
        <SendFeedback />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /Send Feedback/ })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
    const href = link.getAttribute('href') ?? ''
    expect(href).toContain('https://forms.example.com/kana-game-feedback')
    expect(href).toContain('route=%2Fabout')
  })

  it('records feedback_opened on click, without depending on any window.open() return value', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://forms.example.com/kana-game-feedback')
    const trackSpy = vi.spyOn(trackModule, 'track')

    render(
      <MemoryRouter>
        <SendFeedback />
      </MemoryRouter>,
    )
    // jsdom does not actually navigate on an anchor click, so this proves
    // the click handler itself fires the event — no window.open mock is
    // set up at all, unlike the old popup-return-value-gated implementation.
    fireEvent.click(screen.getByRole('link', { name: /Send Feedback/ }))

    expect(trackSpy).toHaveBeenCalledWith('feedback_opened')
  })
})
