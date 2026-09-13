import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntitlementContext, type EntitlementState } from '../components/EntitlementContext'
import { GuideHighlightProvider } from '../components/GuideHighlightProvider'
import { NavBar } from '../components/NavBar'
import { PracticeSummary } from '../components/PracticeSummary'
import { REVIEW_SCOPE_ID } from '../hooks/useCurriculum'
import { useProgressStore } from '../store/progressStore'
import { useSavedItemsStore } from '../store/savedItemsStore'
import { PracticeHubPage } from './PracticeHubPage'
import { ReviewMistakesPage } from './ReviewMistakesPage'
import { SavedPage } from './SavedPage'
import { KanaQuizPage } from './games/KanaQuizPage'
import { KanaTypingPage } from './games/KanaTypingPage'
import { ListeningPage } from './games/ListeningPage'
import { WordBuilderPage } from './games/WordBuilderPage'

const user = { userId: 'learner', emailNormalized: 'learner@example.com' }
const games = [
  ['kana-quiz', KanaQuizPage], ['kana-typing', KanaTypingPage],
  ['listening', ListeningPage], ['word-builder', WordBuilderPage],
] as const

function withAccess(children: ReactNode, status: EntitlementState['status']) {
  const state: EntitlementState = status === 'signed-out' ? { status, user: null } : { status, user }
  return <EntitlementContext.Provider value={{ state, refresh: async () => {}, markSignedOut: () => {} }}>
    <GuideHighlightProvider>{children}</GuideHighlightProvider>
  </EntitlementContext.Provider>
}

function renderSurface(children: ReactNode, status: EntitlementState['status'] = 'inactive') {
  const view = (nextStatus: EntitlementState['status']) => withAccess(<MemoryRouter>{children}</MemoryRouter>, nextStatus)
  return { ...render(view(status)), view }
}

function seedMixedReview() {
  for (const row of ['a-row', 'katakana-a-row', 'sokuon-row']) useProgressStore.getState().markRowTaught(row)
  for (const id of ['a', 'katakana-a', 'missing']) useProgressStore.getState().recordCharacterReviewResult(id, false)
  for (const id of ['a-ai', 'sokuon-oto', 'missing']) useProgressStore.getState().recordWordReviewResult(id, false)
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  useProgressStore.getState().resetProgress()
  useSavedItemsStore.setState({ savedCharacterIds: [], savedWordIds: [] })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('commercial Saved and Review presentation', () => {
  it.each(['signed-out', 'loading', 'inactive', 'unavailable'] as const)('filters Saved cards and both badges while %s, restoring retained items when active', (status) => {
    seedMixedReview()
    useSavedItemsStore.setState({ savedCharacterIds: ['a', 'katakana-a', 'missing'], savedWordIds: ['a-ai', 'sokuon-oto', 'missing'] })
    const progress = JSON.stringify(useProgressStore.getState())
    const saved = JSON.stringify(useSavedItemsStore.getState())
    const storage = JSON.stringify({ ...localStorage })
    const { rerender, view } = renderSurface(<><NavBar /><SavedPage /></>, status)
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Play pronunciation of ア' })).not.toBeInTheDocument()
    expect(screen.queryByText('sound')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Saved\s*2/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Review\s*2/ })).toBeInTheDocument()
    rerender(view('active'))
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(screen.getByText('sound')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Saved\s*4/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Review\s*4/ })).toBeInTheDocument()
    rerender(view(status))
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(JSON.stringify(useProgressStore.getState())).toBe(progress)
    expect(JSON.stringify(useSavedItemsStore.getState())).toBe(saved)
    expect(JSON.stringify({ ...localStorage })).toBe(storage)
  })

  it.each(['chars', 'words'] as const)('filters weak %s cards and restores them on activation', (kind) => {
    seedMixedReview()
    const { rerender, view } = renderSurface(<ReviewMistakesPage kind={kind} />)
    expect(screen.getAllByRole('button', { name: /Play pronunciation/ })).toHaveLength(1)
    rerender(view('active'))
    expect(screen.getAllByRole('button', { name: /Play pronunciation/ })).toHaveLength(2)
  })

  it('does not count unknown Saved IDs even with active entitlement', () => {
    useSavedItemsStore.setState({ savedCharacterIds: ['missing'], savedWordIds: ['missing'] })
    renderSurface(<><NavBar /><SavedPage /></>, 'active')
    expect(screen.getByRole('link', { name: /^Saved$/ })).toBeInTheDocument()
    expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument()
  })

  it('shows the Review hub empty state for a learner with only paid retained history', () => {
    useProgressStore.getState().markRowTaught('katakana-a-row')
    useProgressStore.getState().recordCharacterReviewResult('katakana-a', false)
    renderSurface(<PracticeHubPage rowIdOverride={REVIEW_SCOPE_ID} />)
    expect(screen.getByRole('heading', { name: 'Nothing to review yet' })).toBeInTheDocument()
  })

  it('does not offer the Review guide after practice based only on paid mistakes', () => {
    useProgressStore.getState().markRowTaught('katakana-a-row')
    useProgressStore.getState().recordCharacterReviewResult('katakana-a', false)
    const { rerender, view } = renderSurface(<PracticeSummary title="Complete" backHref="/" onRetry={() => {}} />)
    expect(screen.queryByRole('complementary', { name: 'Review guide' })).not.toBeInTheDocument()
    rerender(view('active'))
    expect(screen.getByRole('complementary', { name: 'Review guide' })).toBeInTheDocument()
  })
})

describe('direct Review game routes', () => {
  it('stops a paid audio prompt when the Review session loses access', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowTaught('sokuon-row')
    useProgressStore.getState().recordWordReviewResult('sokuon-oto', false)
    const { rerender, view } = renderSurface(<ListeningPage rowIdOverride={REVIEW_SCOPE_ID} />, 'active')
    const pause = vi.mocked(HTMLMediaElement.prototype.pause)
    pause.mockClear()
    rerender(view('inactive'))
    expect(pause).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Review complete!' })).toBeInTheDocument()
  })

  it.each([['kana-quiz', KanaQuizPage], ['word-builder', WordBuilderPage]] as const)('%s excludes paid distractor glyphs from an otherwise free game', (_path, Page) => {
    seedMixedReview()
    useProgressStore.setState({
      characters: { a: useProgressStore.getState().characters.a },
      words: { 'a-ai': useProgressStore.getState().words['a-ai'] },
    })
    const { container } = renderSurface(<Page rowIdOverride={REVIEW_SCOPE_ID} />)
    expect(container.textContent).not.toMatch(/[\u30a0-\u30ff]/u)
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('removes a revealed paid answer on revocation without changing its retained review result', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowTaught('sokuon-row')
    useProgressStore.getState().recordWordReviewResult('sokuon-oto', false)
    const { rerender, view, container } = renderSurface(<KanaTypingPage rowIdOverride={REVIEW_SCOPE_ID} />, 'active')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'あ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    const progress = JSON.stringify(useProgressStore.getState())
    const storage = JSON.stringify({ ...localStorage })
    rerender(view('inactive'))
    expect(container.textContent).not.toContain('sound')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Review complete!' })).toBeInTheDocument()
    expect(JSON.stringify(useProgressStore.getState())).toBe(progress)
    expect(JSON.stringify({ ...localStorage })).toBe(storage)
  })

  it('keeps a normal Hiragana row session across entitlement changes', () => {
    const view = (status: EntitlementState['status']) => withAccess(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row/kana-typing']}><Routes>
        <Route path="/practice/:categoryId/:rowId/kana-typing" element={<KanaTypingPage />} />
      </Routes></MemoryRouter>, status,
    )
    const { rerender } = render(view('active'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'あ' } })
    rerender(view('inactive'))
    expect(screen.getByRole('textbox')).toBe(input)
    expect(input).toHaveValue('あ')
  })

  it.each(games)('%s excludes retained paid targets, then restores and revokes the frozen session', (path, Page) => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowTaught('katakana-a-row')
    useProgressStore.getState().markRowTaught('sokuon-row')
    useProgressStore.getState().recordCharacterReviewResult('katakana-a', false)
    useProgressStore.getState().recordWordReviewResult('sokuon-oto', false)
    const progress = JSON.stringify(useProgressStore.getState())
    const saved = JSON.stringify(useSavedItemsStore.getState())
    const storage = JSON.stringify({ ...localStorage })
    const view = (status: EntitlementState['status']) => withAccess(
      <MemoryRouter initialEntries={[`/practice/review/${path}`]}><Routes>
        <Route path={`/practice/review/${path}`} element={<Page rowIdOverride={REVIEW_SCOPE_ID} />} />
        <Route path="/" element={<p>Home fallback</p>} />
      </Routes></MemoryRouter>, status,
    )
    const { rerender, container } = render(view('inactive'))
    expect(screen.getByRole('heading', { name: 'Review complete!' })).toBeInTheDocument()
    rerender(view('active'))
    expect(screen.queryByRole('heading', { name: 'Review complete!' })).not.toBeInTheDocument()
    if (path === 'kana-quiz') expect(container.textContent).toContain('ア')
    else expect(container.querySelector('img[src$="sokuon-oto.webp"]')).toBeInTheDocument()
    rerender(view('inactive'))
    expect(screen.getByRole('heading', { name: 'Review complete!' })).toBeInTheDocument()
    expect(container.textContent).not.toContain('ア')
    expect(container.querySelector('img[src$="sokuon-oto.webp"]')).not.toBeInTheDocument()
    rerender(view('active'))
    expect(screen.queryByRole('heading', { name: 'Review complete!' })).not.toBeInTheDocument()
    expect(JSON.stringify(useProgressStore.getState())).toBe(progress)
    expect(JSON.stringify(useSavedItemsStore.getState())).toBe(saved)
    expect(JSON.stringify({ ...localStorage })).toBe(storage)
  })

  it.each(['loading', 'unavailable'] as const)('keeps a playable Hiragana typing session during %s -> inactive', (status) => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    const { rerender, view } = renderSurface(<KanaTypingPage rowIdOverride={REVIEW_SCOPE_ID} />, status)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'あ' } })
    rerender(view('inactive'))
    expect(screen.getByRole('textbox')).toBe(input)
    expect(input).toHaveValue('あ')
  })
})
