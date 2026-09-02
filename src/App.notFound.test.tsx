import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { useProgressStore } from './store/progressStore'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  useProgressStore.getState().setHasCompletedIntroGuide(true)
})

describe('unmatched route recovery', () => {
  it('shows a learner-facing recovery state for a genuinely unmatched route', () => {
    renderAt('/this-route-does-not-exist')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText("This page isn't available.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/')
  })

  it('returns to Home through the recovery action', () => {
    renderAt('/this-route-does-not-exist')

    fireEvent.click(screen.getByRole('link', { name: 'Go Home' }))

    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })
})
