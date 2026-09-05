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

  it('clicking Send Feedback actually opens the configured destination', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://forms.example.com/kana-game-feedback')
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const trackSpy = vi.spyOn(trackModule, 'track')

    render(
      <MemoryRouter initialEntries={['/about']}>
        <SendFeedback />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Send Feedback'))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const [openedUrl, target, features] = openSpy.mock.calls[0]
    expect(String(openedUrl)).toContain('https://forms.example.com/kana-game-feedback')
    expect(String(openedUrl)).toContain('route=%2Fabout')
    expect(target).toBe('_blank')
    expect(features).toContain('noopener')
    expect(trackSpy).toHaveBeenCalledWith('feedback_opened')
  })

  it('does not fire feedback_opened if window.open fails (e.g. popup blocked)', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://forms.example.com/kana-game-feedback')
    vi.spyOn(window, 'open').mockReturnValue(null)
    const trackSpy = vi.spyOn(trackModule, 'track')

    render(
      <MemoryRouter>
        <SendFeedback />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Send Feedback'))

    expect(trackSpy).not.toHaveBeenCalledWith('feedback_opened')
  })
})
