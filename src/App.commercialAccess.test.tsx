import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as productionAuthClient from './lib/auth/productionAuthClient'
import { useProgressStore } from './store/progressStore'

vi.mock('./lib/auth/productionAuthClient', async () => {
  const actual = await vi.importActual<typeof import('./lib/auth/productionAuthClient')>('./lib/auth/productionAuthClient')
  return {
    ...actual,
    fetchCurrentUserResult: vi.fn(),
    fetchCurrentEntitlementResult: vi.fn(),
  }
})

const user = { userId: 'learner-1', emailNormalized: 'learner@example.com' }

type EntitlementFixture = 'loading' | 'signed-out' | 'inactive' | 'active' | 'unavailable'

function setEntitlement(fixture: EntitlementFixture) {
  if (fixture === 'loading') {
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockImplementation(() => new Promise(() => {}))
    return
  }
  if (fixture === 'signed-out') {
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockResolvedValue({ kind: 'signed-out' })
    return
  }
  if (fixture === 'unavailable') {
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockResolvedValue({ kind: 'unavailable' })
    return
  }

  vi.mocked(productionAuthClient.fetchCurrentUserResult).mockResolvedValue({ kind: 'authenticated', user })
  vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockResolvedValue({
    kind: 'available',
    entitlement: { active: fixture === 'active' },
  })
}

function renderAt(path: string, fixture: EntitlementFixture) {
  setEntitlement(fixture)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'https://api.example.com')
  vi.mocked(productionAuthClient.fetchCurrentUserResult).mockReset()
  vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockReset()
  useProgressStore.getState().resetProgress()
  useProgressStore.getState().setHasCompletedIntroGuide(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const paidRowRoutes = [
  ['/learn/katakana/katakana-a-row', 'Learn'],
  ['/practice/katakana/katakana-a-row', 'Practice Hub'],
  ['/practice/katakana/katakana-a-row/tracing', 'Tracing'],
  ['/practice/katakana/katakana-a-row/kana-quiz', 'Kana Quiz'],
  ['/practice/katakana/katakana-a-row/listening', 'Listening'],
  ['/practice/katakana/katakana-a-row/kana-typing', 'Kana Typing'],
  ['/practice/katakana/katakana-a-row/word-builder', 'Word Builder'],
] as const

describe('commercial access on direct routes', () => {
  it.each(paidRowRoutes)('blocks signed-out direct access to %s (%s)', async (path) => {
    renderAt(path, 'signed-out')

    expect(await screen.findByRole('heading', { name: 'Sign in to unlock' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it.each([
    ['/restaurant/katakana-complete', 'Restaurant'],
    ['/cafe/katakana-ha-row', 'Cafe'],
  ])('blocks signed-out direct access to paid %s checkpoints', async (path) => {
    renderAt(path, 'signed-out')

    expect(await screen.findByRole('heading', { name: 'Sign in to unlock' })).toBeInTheDocument()
  })

  it.each([
    'katakana',
    'sokuon-chouon',
    'youon-special-katakana',
    'final-graduation',
  ])('blocks signed-out direct access to the paid %s assessment', async (assessment) => {
    renderAt(`/assessment/${assessment}`, 'signed-out')

    expect(await screen.findByRole('heading', { name: 'Sign in to unlock' })).toBeInTheDocument()
  })

  it.each([
    ['loading', 'Checking access…'],
    ['signed-out', 'Sign in to unlock'],
    ['inactive', 'Full Tamamizu required'],
    ['unavailable', 'Couldn’t verify access'],
  ] as const)('denies a paid route while entitlement is %s', async (fixture, message) => {
    renderAt('/practice/katakana/katakana-a-row', fixture)

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ア〜オ・カ〜ゴ・ン・ー' })).not.toBeInTheDocument()
  })

  it.each([
    ['/learn/katakana/katakana-a-row', /new characters/],
    ['/practice/katakana/katakana-a-row', 'ア〜オ・カ〜ゴ・ン・ー'],
    ['/practice/katakana/katakana-a-row/tracing', 'Start Tracing'],
    ['/practice/katakana/katakana-a-row/kana-quiz', /Round 1/],
    ['/practice/katakana/katakana-a-row/listening', /Round 1/],
    ['/practice/katakana/katakana-a-row/kana-typing', /Round 1/],
    ['/practice/katakana/katakana-a-row/word-builder', /Round 1/],
    ['/restaurant/katakana-complete', "Let's order at a restaurant."],
    ['/cafe/katakana-ha-row', "Let's order at a cafe."],
  ] as const)('renders %s with active commercial access', async (path, expectedText) => {
    renderAt(path, 'active')

    expect(await screen.findByText(expectedText)).toBeInTheDocument()
  })

  it.each([
    'katakana',
    'sokuon-chouon',
    'youon-special-katakana',
    'final-graduation',
  ])('renders the paid %s assessment with active commercial access', async (assessment) => {
    renderAt(`/assessment/${assessment}`, 'active')

    expect(await screen.findByText(/Question 1 \/ /)).toBeInTheDocument()
  })

  it.each([
    ['/learn/hiragana/a-row', /new characters/],
    ['/practice/hiragana/a-row', 'あ〜お・ん'],
    ['/practice/hiragana/a-row/tracing', 'Start Tracing'],
    ['/practice/hiragana/a-row/kana-quiz', /Round 1/],
    ['/practice/hiragana/a-row/listening', /Round 1/],
    ['/practice/hiragana/a-row/kana-typing', /Round 1/],
    ['/practice/hiragana/a-row/word-builder', /Round 1/],
    ['/restaurant/hiragana-complete', "Let's order at a restaurant."],
    ['/assessment/hiragana', /Question 1 \/ /],
  ] as const)('keeps free Hiragana route %s visible while loading', async (path, expectedText) => {
    renderAt(path, 'loading')

    expect(await screen.findByText(expectedText)).toBeInTheDocument()
  })

  it.each([
    ['/learn/hiragana/a-row', /new characters/],
    ['/practice/hiragana/a-row', 'あ〜お・ん'],
    ['/restaurant/hiragana-complete', "Let's order at a restaurant."],
    ['/assessment/hiragana', /Question 1 \/ /],
  ] as const)('keeps free Hiragana route %s visible when entitlement is unavailable', async (path, expectedText) => {
    renderAt(path, 'unavailable')

    expect(await screen.findByText(expectedText)).toBeInTheDocument()
  })

  it.each([
    '/learn/katakana/not-a-real-row',
    '/practice/katakana/not-a-real-row',
    '/practice/katakana/not-a-real-row/kana-quiz',
    '/practice/hiragana/katakana-a-row',
    '/practice/katakana/a-row',
    '/assessment/not-a-real-assessment',
    '/restaurant/not-a-real-checkpoint',
    '/cafe/not-a-real-checkpoint',
    '/restaurant/katakana-ha-row',
    '/cafe/katakana-complete',
  ])('fails closed before rendering a route with invalid parameters: %s', async (path) => {
    renderAt(path, 'active')

    expect(await screen.findByRole('heading', { name: 'Content locked' })).toBeInTheDocument()
    await waitFor(() => expect(document.body.textContent).not.toContain('Assessment not found'))
  })
})
