import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
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
