import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('ErrorBoundary', () => {
  it('renders children unchanged when no render error occurs', () => {
    render(
      <ErrorBoundary>
        <p>Normal lesson content</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Normal lesson content')).toBeInTheDocument()
  })

  it('shows a learner-facing fallback without exposing raw diagnostics', () => {
    function BrokenChild(): never {
      throw new Error('SECRET_RENDER_FAILURE')
    }

    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('Try again, or return to Home.')).toBeInTheDocument()
    expect(screen.queryByText(/SECRET_RENDER_FAILURE/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Component stack/i)).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()
  })

  it('can retry after a transient render failure', () => {
    let shouldThrow = true
    function RecoverableChild() {
      if (shouldThrow) throw new Error('transient failure')
      return <p>Recovered lesson content</p>
    }

    render(
      <ErrorBoundary>
        <RecoverableChild />
      </ErrorBoundary>,
    )

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))

    expect(screen.getByText('Recovered lesson content')).toBeInTheDocument()
  })

  it('offers a Home link that reloads the app at the root hash route', () => {
    function BrokenChild(): never {
      throw new Error('persistent failure')
    }

    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/kana-game/#/')
  })
})
