import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { useProgressStore } from './store/progressStore'

// Route-resolution tests. Curl/HTTP checks against the dev server can't
// verify this app's client-side routing at all — it's mounted under
// HashRouter (see main.tsx) specifically because GitHub Pages has no
// server-side rewrite, so every URL path a plain HTTP request can reach
// just serves index.html regardless of whether the hash route inside it is
// valid. MemoryRouter lets React Router actually resolve a path here.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

describe('routing', () => {
  it('/ renders the home page', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })

  it('/practice/hiragana/a-row renders that row\'s Practice Hub', () => {
    renderAt('/practice/hiragana/a-row')
    expect(screen.getByRole('heading', { name: 'あ~お' })).toBeInTheDocument()
  })

  it('/learn/hiragana/a-row renders the Learn flow for that row', () => {
    renderAt('/learn/hiragana/a-row')
    expect(screen.getByText(/new characters/)).toBeInTheDocument()
  })

  it('/practice/hiragana/a-row/kana-quiz renders the Kana Quiz game', () => {
    renderAt('/practice/hiragana/a-row/kana-quiz')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('/practice/hiragana/a-row/tracing renders the Tracing page', () => {
    renderAt('/practice/hiragana/a-row/tracing')
    expect(screen.getByText('Trace each character')).toBeInTheDocument()
  })

  it('a mismatched category (a-row is hiragana, not katakana) redirects home rather than rendering', () => {
    renderAt('/practice/katakana/a-row')
    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })

  it('/practice/katakana/katakana-a-row renders that row\'s Practice Hub', () => {
    renderAt('/practice/katakana/katakana-a-row')
    expect(screen.getByRole('heading', { name: 'ア~オ・カ~ゴ・ー・ン' })).toBeInTheDocument()
  })

  it('/learn/katakana/katakana-a-row renders the Learn flow for that row', () => {
    renderAt('/learn/katakana/katakana-a-row')
    expect(screen.getByText(/new characters/)).toBeInTheDocument()
  })

  it('/practice/katakana/katakana-a-row/kana-quiz renders the Kana Quiz game', () => {
    renderAt('/practice/katakana/katakana-a-row/kana-quiz')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('an unknown row id redirects home', () => {
    renderAt('/practice/hiragana/not-a-real-row')
    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })

  it('/practice/review is unreachable (redirects home) until at least one row is taught', () => {
    renderAt('/practice/review')
    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })

  it('/practice/review renders once a row has been taught, without a category segment', () => {
    useProgressStore.getState().markRowTaught('a-row')
    renderAt('/practice/review')
    expect(screen.getByRole('heading', { name: 'Review — all learned rows' })).toBeInTheDocument()
  })

  it('/practice/review/kana-quiz renders the review-scoped Kana Quiz once a row is taught', () => {
    useProgressStore.getState().markRowTaught('a-row')
    renderAt('/practice/review/kana-quiz')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('the old pre-migration URL shape (no category segment) does not match any route', () => {
    renderAt('/practice/a-row')
    // No route pattern matches a single-segment /practice/:x anymore, so
    // React Router renders nothing inside <Routes> — just confirm this
    // doesn't crash and doesn't accidentally render the Practice Hub.
    expect(screen.queryByRole('heading', { name: 'あ~お' })).not.toBeInTheDocument()
  })
})

// The three top-level script pages (see HomePage.tsx's chooser cards and
// App.tsx's OTHER_CATEGORY_IDS) — replaced the single flat HomePage that
// used to stack every category's rows on one page.
describe('script chooser pages', () => {
  it('/hiragana shows only hiragana rows', () => {
    renderAt('/hiragana')
    expect(screen.getByRole('heading', { name: 'ひらがな' })).toBeInTheDocument()
    expect(screen.getByText('あ~お')).toBeInTheDocument()
    expect(screen.queryByText('ア~オ・カ~ゴ・ー・ン')).not.toBeInTheDocument()
  })

  it('/katakana shows only katakana rows', () => {
    renderAt('/katakana')
    expect(screen.getByRole('heading', { name: 'カタカナ' })).toBeInTheDocument()
    expect(screen.getByText('ア~オ・カ~ゴ・ー・ン')).toBeInTheDocument()
    expect(screen.queryByText('あ~お')).not.toBeInTheDocument()
  })

  it('/other shows an empty state when no non-hiragana/katakana category exists yet', () => {
    renderAt('/other')
    expect(screen.getByRole('heading', { name: 'そのほか' })).toBeInTheDocument()
    expect(screen.getByText('まだ利用できるレッスンがありません。')).toBeInTheDocument()
  })

  it('home page links to all three script pages', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: /ひらがな/ })).toHaveAttribute('href', '/hiragana')
    expect(screen.getByRole('link', { name: /カタカナ/ })).toHaveAttribute('href', '/katakana')
    expect(screen.getByRole('link', { name: /そのほか/ })).toHaveAttribute('href', '/other')
  })
})
