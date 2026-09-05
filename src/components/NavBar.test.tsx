import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProgressStore } from '../store/progressStore'
import { useSavedItemsStore } from '../store/savedItemsStore'
import { GuideHighlightProvider } from './GuideHighlightProvider'
import { NavBar } from './NavBar'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  useSavedItemsStore.setState({ savedCharacterIds: [], savedWordIds: [] })
})

function renderNav() {
  return render(
    <MemoryRouter>
      <GuideHighlightProvider>
        <NavBar />
      </GuideHighlightProvider>
    </MemoryRouter>,
  )
}

describe('NavBar top row', () => {
  it('renders Home, Review, and Saved as icon+label links', () => {
    renderNav()
    expect(screen.getByRole('link', { name: /Home/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /^Review$/ })).toHaveAttribute('href', '/review')
    expect(screen.getByRole('link', { name: /^Saved$/ })).toHaveAttribute('href', '/saved')
  })

  // P2 fix (PR #210 final review): the icon and label used to be stacked
  // (flex-col: icon above, label below) rather than the decided final
  // layout of icon + label side by side on one line.
  it('lays out icon and label side by side (not stacked vertically) for Home/Review/Saved', () => {
    renderNav()
    for (const name of [/^Home$/, /^Review$/, /^Saved$/]) {
      const link = screen.getByRole('link', { name })
      expect(link.className).toMatch(/\bitems-center\b/)
      expect(link.className).not.toMatch(/\bflex-col\b/)
    }
  })

  it('renders Settings as a gear-only link with no visible "Settings" text', () => {
    renderNav()
    const settingsLink = screen.getByRole('link', { name: 'Settings' })
    expect(settingsLink).toHaveAttribute('href', '/settings')
    // The accessible name comes entirely from aria-label — no visible text
    // node "Settings" should exist anywhere in the link's rendered content.
    expect(settingsLink.textContent).not.toMatch(/Settings/)
  })

  it('does not render a visible top-level About link', () => {
    renderNav()
    expect(screen.queryByRole('link', { name: /^About$/ })).not.toBeInTheDocument()
  })
})

describe('NavBar Review badge', () => {
  it('hides the badge when reviewCount is 0', () => {
    renderNav()
    const reviewLink = screen.getByRole('link', { name: /^Review$/ })
    expect(reviewLink.querySelector('span.bg-red-500')).not.toBeInTheDocument()
  })

  it('shows the exact count for a positive reviewCount', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    renderNav()
    const reviewLink = screen.getByRole('link', { name: /Review\s*1/ })
    expect(reviewLink.querySelector('span.bg-red-500')).toHaveTextContent('1')
  })

  // P2 fix (PR #210 final review): the badge used to be positioned
  // `relative` to the ENTIRE nav cell (icon + label + tap-target padding),
  // so it could visually anchor far from the label it's meant to overlay.
  // It must instead be scoped to a small wrapper around just the label
  // text, so it visually sits at the corner of "Review"/"Saved" themselves.
  it('positions the badge relative to a small label-only wrapper, not the whole nav cell', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    renderNav()
    const reviewLink = screen.getByRole('link', { name: /Review\s*1/ })
    const badge = reviewLink.querySelector('span.bg-red-500')!
    const positioningAncestor = badge.parentElement!
    expect(positioningAncestor.className).toMatch(/\brelative\b/)
    // The positioning ancestor should be a small inline wrapper around
    // just the label — not equal to the NavLink itself, and not carrying
    // the NavLink's own flex-1/tap-target sizing classes.
    expect(positioningAncestor).not.toBe(reviewLink)
    expect(positioningAncestor.className).not.toMatch(/\bflex-1\b/)
  })
})

describe('NavBar Saved badge', () => {
  it('hides the badge when nothing is saved', () => {
    renderNav()
    const savedLink = screen.getByRole('link', { name: /^Saved$/ })
    expect(savedLink.querySelector('span.bg-red-500')).not.toBeInTheDocument()
  })

  it('shows the combined character+word saved count', () => {
    useSavedItemsStore.getState().toggleCharacter('a')
    useSavedItemsStore.getState().toggleWord('a-ai')
    renderNav()
    const savedLink = screen.getByRole('link', { name: /Saved\s*2/ })
    expect(savedLink.querySelector('span.bg-red-500')).toHaveTextContent('2')
  })

  it('caps display at 99+ beyond 99 saved items', () => {
    for (let i = 0; i < 105; i++) useSavedItemsStore.getState().toggleCharacter(`char-${i}`)
    renderNav()
    const savedLink = screen.getByRole('link', { name: /Saved/ })
    const badge = savedLink.querySelector('span.bg-red-500')
    expect(badge).toHaveTextContent('99+')
  })
})
