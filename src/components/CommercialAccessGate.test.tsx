import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { CommercialAccessTarget } from '../lib/commercialAccess'
import { EntitlementContext, type EntitlementState } from './EntitlementContext'
import { CommercialAccessGate } from './CommercialAccessGate'

const signedInUser = { userId: 'learner-1', emailNormalized: 'learner@example.com' }

function renderGate(target: CommercialAccessTarget, state: EntitlementState, refresh = vi.fn().mockResolvedValue(undefined)) {
  render(
    <MemoryRouter>
      <EntitlementContext.Provider value={{ state, refresh, markSignedOut: vi.fn() }}>
        <CommercialAccessGate target={target}>
          <p>Protected lesson</p>
        </CommercialAccessGate>
      </EntitlementContext.Provider>
    </MemoryRouter>,
  )
  return refresh
}

describe('CommercialAccessGate', () => {
  it.each<EntitlementState>([
    { status: 'loading', user: null },
    { status: 'unavailable', user: null },
  ])('keeps Hiragana content visible while $status', (state) => {
    renderGate({ kind: 'row', rowId: 'a-row' }, state)
    expect(screen.getByText('Protected lesson')).toBeInTheDocument()
  })

  it.each<EntitlementState>([
    { status: 'loading', user: null },
    { status: 'signed-out', user: null },
    { status: 'inactive', user: signedInUser },
    { status: 'unavailable', user: signedInUser },
  ])('hides paid content while $status', (state) => {
    renderGate({ kind: 'row', rowId: 'katakana-a-row' }, state)
    expect(screen.queryByText('Protected lesson')).not.toBeInTheDocument()
  })

  it('shows loading state for paid content while entitlement is loading', () => {
    renderGate({ kind: 'row', rowId: 'katakana-a-row' }, { status: 'loading', user: null })
    expect(screen.getByRole('status')).toHaveTextContent('Checking access…')
  })

  it('links signed-out learners to sign in and their account', () => {
    renderGate({ kind: 'row', rowId: 'katakana-a-row' }, { status: 'signed-out', user: null })
    expect(screen.getByRole('heading', { name: 'Sign in to unlock' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
  })

  it('links inactive learners to their account', () => {
    renderGate({ kind: 'row', rowId: 'katakana-a-row' }, { status: 'inactive', user: signedInUser })
    expect(screen.getByRole('heading', { name: 'Full Access required' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
  })

  it('offers Retry and Account access when the entitlement service is unavailable', () => {
    const refresh = renderGate({ kind: 'row', rowId: 'katakana-a-row' }, { status: 'unavailable', user: signedInUser })
    expect(screen.getByRole('heading', { name: 'Couldn’t verify access' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('fails closed for an unknown target even with an active entitlement', () => {
    renderGate({ kind: 'row', rowId: 'not-a-row' }, { status: 'active', user: signedInUser })
    expect(screen.queryByText('Protected lesson')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Content locked' })).toBeInTheDocument()
  })

  it('renders paid content with an active entitlement', () => {
    renderGate({ kind: 'row', rowId: 'katakana-a-row' }, { status: 'active', user: signedInUser })
    expect(screen.getByText('Protected lesson')).toBeInTheDocument()
  })
})
