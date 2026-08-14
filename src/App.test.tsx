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
    expect(screen.getByRole('heading', { name: 'ア~オ' })).toBeInTheDocument()
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

// 促音 (sokuon) is the first 'contrast-pairs' category — these tests cover
// the Learn/Practice/Tracing generalization described in
// docs/curriculum-extensibility.md, alongside the regression checks below
// proving hiragana/katakana ('character-set') behavior is unchanged.
describe('contrast-pairs learnStyle (sokuon)', () => {
  it('/practice/sokuon/sokuon-row renders that row\'s Practice Hub', () => {
    renderAt('/practice/sokuon/sokuon-row')
    expect(screen.getByRole('heading', { name: 'っ・ッ' })).toBeInTheDocument()
  })

  it('the sokuon Practice Hub offers Learn, Tracing, and 3 games, but NOT Kana Quiz', () => {
    renderAt('/practice/sokuon/sokuon-row')
    expect(screen.getByRole('link', { name: /Learn/ })).toBeInTheDocument()
    expect(screen.getByText('Tracing')).toBeInTheDocument()
    expect(screen.getByText('Word Builder')).toBeInTheDocument()
    expect(screen.getByText('Listening')).toBeInTheDocument()
    expect(screen.getByText('Kana Typing')).toBeInTheDocument()
    expect(screen.queryByText('Kana Quiz')).not.toBeInTheDocument()
  })

  it('the hiragana Practice Hub still offers Kana Quiz (regression: character-set categories unaffected)', () => {
    renderAt('/practice/hiragana/a-row')
    expect(screen.getByText('Kana Quiz')).toBeInTheDocument()
  })

  it('/learn/sokuon/sokuon-row skips the flashcard step and goes straight to the word list', () => {
    renderAt('/learn/sokuon/sokuon-row')
    expect(screen.getByText(/listen and compare/)).toBeInTheDocument()
    expect(screen.queryByText(/new characters/)).not.toBeInTheDocument()
  })

  it('/learn/hiragana/a-row still starts on the flashcard step (regression)', () => {
    renderAt('/learn/hiragana/a-row')
    expect(screen.getByText(/new characters/)).toBeInTheDocument()
  })

  it('/practice/sokuon/sokuon-row/tracing starts directly in the word phase, skipping the character phase', () => {
    renderAt('/practice/sokuon/sokuon-row/tracing')
    expect(screen.getByText('Trace each word')).toBeInTheDocument()
    expect(screen.queryByText('Trace each character')).not.toBeInTheDocument()
  })

  it('/practice/hiragana/a-row/tracing still starts in the character phase (regression)', () => {
    renderAt('/practice/hiragana/a-row/tracing')
    expect(screen.getByText('Trace each character')).toBeInTheDocument()
  })

  it('direct navigation to the sokuon Kana Quiz route redirects home rather than rendering', () => {
    renderAt('/practice/sokuon/sokuon-row/kana-quiz')
    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })

  it('/practice/sokuon/sokuon-row/word-builder still renders normally (contrast-pairs categories keep the other 3 games)', () => {
    renderAt('/practice/sokuon/sokuon-row/word-builder')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })
})
