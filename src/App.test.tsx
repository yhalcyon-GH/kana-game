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

// 長音 (chōon) is also 'contrast-pairs', but its row's characterIds is []
// (see curriculum.ts's chouon-row comment) — the first real test of the
// "zero new characters" path docs/curriculum-extensibility.md flagged as
// future-proofed-but-untested when sokuon's generalization landed. These
// tests prove Learn/Practice/Tracing all handle an empty characterIds row
// the same way they handle sokuon's non-empty one, with no crash and no
// broken/empty screen.
describe('contrast-pairs learnStyle with zero new characters (chōon)', () => {
  it('/practice/chouon/chouon-row renders that row\'s Practice Hub', () => {
    renderAt('/practice/chouon/chouon-row')
    expect(screen.getByRole('heading', { name: 'ー' })).toBeInTheDocument()
  })

  it('the chouon Practice Hub offers Learn, Tracing, and 3 games, but NOT Kana Quiz', () => {
    renderAt('/practice/chouon/chouon-row')
    expect(screen.getByRole('link', { name: /Learn/ })).toBeInTheDocument()
    expect(screen.getByText('Tracing')).toBeInTheDocument()
    expect(screen.getByText('Word Builder')).toBeInTheDocument()
    expect(screen.getByText('Listening')).toBeInTheDocument()
    expect(screen.getByText('Kana Typing')).toBeInTheDocument()
    expect(screen.queryByText('Kana Quiz')).not.toBeInTheDocument()
  })

  it('/learn/chouon/chouon-row skips the flashcard step (no characters to flashcard) and goes straight to the word list', () => {
    renderAt('/learn/chouon/chouon-row')
    expect(screen.getByText(/listen and compare/)).toBeInTheDocument()
    expect(screen.queryByText(/new characters/)).not.toBeInTheDocument()
    // The word list itself must actually render real content, not an
    // empty grid — confirms an empty characterIds row doesn't also end up
    // with an empty word list.
    expect(screen.getByText('おかあさん')).toBeInTheDocument()
  })

  it('/practice/chouon/chouon-row/tracing starts directly in the word phase, and does not crash despite an empty character pool', () => {
    renderAt('/practice/chouon/chouon-row/tracing')
    expect(screen.getByText('Trace each word')).toBeInTheDocument()
    expect(screen.queryByText('Trace each character')).not.toBeInTheDocument()
  })

  it('direct navigation to the chouon Kana Quiz route redirects home rather than rendering', () => {
    renderAt('/practice/chouon/chouon-row/kana-quiz')
    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })

  it('/practice/chouon/chouon-row/word-builder still renders normally, drawing distractor tiles from the full hiragana+katakana pool', () => {
    renderAt('/practice/chouon/chouon-row/word-builder')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('/practice/chouon/chouon-row/listening still renders normally', () => {
    renderAt('/practice/chouon/chouon-row/listening')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('sokuon and hiragana/katakana behavior is unaffected by chouon existing (regression)', () => {
    renderAt('/practice/sokuon/sokuon-row')
    expect(screen.getByRole('heading', { name: 'っ・ッ' })).toBeInTheDocument()
    expect(screen.queryByText('Kana Quiz')).not.toBeInTheDocument()
  })
})

// 拗音 (yōon) is back to 'character-set' — the same flashcard -> recap ->
// words shape as hiragana/katakana, NOT 'contrast-pairs' like sokuon/chōon
// above (see docs/curriculum-extensibility.md). These tests confirm that
// generic routing/flow, plus the one real yōon-specific wrinkle: its
// characters are 2 glyphs/1 mora, which WordCard.test.tsx and
// StrokeOrderAnimation.test.tsx already prove degrades safely in isolation
// — the /learn and /tracing checks here confirm the same holds when those
// components are actually mounted inside the real page flow, not just unit
// tests of the component alone.
describe('character-set learnStyle with yōon (multi-glyph, one-mora characters)', () => {
  it('/practice/youon/youon-ka-row renders that row\'s Practice Hub', () => {
    renderAt('/practice/youon/youon-ka-row')
    expect(screen.getByRole('heading', { name: 'きゃ・きゅ・きょ・ぎゃ・ぎゅ・ぎょ' })).toBeInTheDocument()
  })

  it('the youon Practice Hub offers all 4 games, including Kana Quiz (regression: character-set categories keep it, unlike contrast-pairs)', () => {
    renderAt('/practice/youon/youon-ka-row')
    expect(screen.getByText('Kana Quiz')).toBeInTheDocument()
    expect(screen.getByText('Kana Typing')).toBeInTheDocument()
    expect(screen.getByText('Listening')).toBeInTheDocument()
    expect(screen.getByText('Word Builder')).toBeInTheDocument()
  })

  it('/learn/youon/youon-ka-row starts on the flashcard step, like hiragana/katakana (not skipped like contrast-pairs)', () => {
    renderAt('/learn/youon/youon-ka-row')
    expect(screen.getByText(/new characters/)).toBeInTheDocument()
  })

  it('/practice/youon/youon-ka-row/kana-quiz renders normally rather than redirecting home', () => {
    renderAt('/practice/youon/youon-ka-row/kana-quiz')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('/practice/youon/youon-ka-row/tracing starts in the character phase and does not crash on a yōon character with no stroke data', () => {
    // きゃ (kya, this row's first character) has no KanjiVG stroke data (see
    // StrokeOrderAnimation.test.tsx) — this just confirms the whole Tracing
    // page still renders normally around that empty guide, not only the
    // stroke component in isolation.
    renderAt('/practice/youon/youon-ka-row/tracing')
    expect(screen.getByText('Trace each character')).toBeInTheDocument()
  })

  it('/practice/youon/youon-ka-row/word-builder renders real words built from multi-glyph yōon characters', () => {
    renderAt('/practice/youon/youon-ka-row/word-builder')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('sokuon/chōon/hiragana/katakana behavior is unaffected by youon existing (regression)', () => {
    renderAt('/practice/sokuon/sokuon-row')
    expect(screen.getByRole('heading', { name: 'っ・ッ' })).toBeInTheDocument()
    expect(screen.queryByText('Kana Quiz')).not.toBeInTheDocument()

    renderAt('/practice/hiragana/a-row')
    expect(screen.getByText('Kana Quiz')).toBeInTheDocument()
  })
})

// 特殊音 (tokushuon) — the sixth and final planned category (see
// docs/curriculum-extensibility.md), also 'character-set' like 拗音/カタカナ.
// Same generic-flow confirmation as yōon's block above, plus its own
// multi-glyph wrinkle already proven safe in isolation by
// WordCard.test.tsx/StrokeOrderAnimation.test.tsx — these confirm the same
// holds mounted inside the real page flow.
describe('character-set learnStyle with 特殊音/tokushuon (multi-glyph characters, one genuinely 1-glyph exception)', () => {
  it('/practice/tokushuon/tokushuon-fa-row renders that row\'s Practice Hub', () => {
    renderAt('/practice/tokushuon/tokushuon-fa-row')
    expect(screen.getByRole('heading', { name: 'ファ・フィ・フェ・フォ' })).toBeInTheDocument()
  })

  it('the tokushuon Practice Hub offers all 4 games, including Kana Quiz (regression: character-set categories keep it, unlike contrast-pairs)', () => {
    renderAt('/practice/tokushuon/tokushuon-fa-row')
    expect(screen.getByText('Kana Quiz')).toBeInTheDocument()
    expect(screen.getByText('Kana Typing')).toBeInTheDocument()
    expect(screen.getByText('Listening')).toBeInTheDocument()
    expect(screen.getByText('Word Builder')).toBeInTheDocument()
  })

  it('/learn/tokushuon/tokushuon-fa-row starts on the flashcard step, like hiragana/katakana/yōon (not skipped like contrast-pairs)', () => {
    renderAt('/learn/tokushuon/tokushuon-fa-row')
    expect(screen.getByText(/new characters/)).toBeInTheDocument()
  })

  it('/practice/tokushuon/tokushuon-fa-row/kana-quiz renders normally rather than redirecting home', () => {
    renderAt('/practice/tokushuon/tokushuon-fa-row/kana-quiz')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('/practice/tokushuon/tokushuon-fa-row/tracing starts in the character phase and does not crash on a tokushuon character with no stroke data', () => {
    renderAt('/practice/tokushuon/tokushuon-fa-row/tracing')
    expect(screen.getByText('Trace each character')).toBeInTheDocument()
  })

  it('/practice/tokushuon/tokushuon-fa-row/word-builder renders real words built from multi-glyph tokushuon characters', () => {
    renderAt('/practice/tokushuon/tokushuon-fa-row/word-builder')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('/practice/tokushuon/tokushuon-va-row renders the row containing the one 1-glyph tokushuon character (ヴ) without crashing', () => {
    renderAt('/practice/tokushuon/tokushuon-va-row')
    expect(screen.getByRole('heading', { name: 'ヴ・ヴァ・ヴィ・ヴェ・ヴォ' })).toBeInTheDocument()
  })

  it('sokuon/chōon/yōon/hiragana/katakana behavior is unaffected by tokushuon existing (regression)', () => {
    const sokuonRender = renderAt('/practice/sokuon/sokuon-row')
    expect(screen.getByRole('heading', { name: 'っ・ッ' })).toBeInTheDocument()
    expect(screen.queryByText('Kana Quiz')).not.toBeInTheDocument()
    sokuonRender.unmount()

    const youonRender = renderAt('/practice/youon/youon-ka-row')
    expect(screen.getByText('Kana Quiz')).toBeInTheDocument()
    youonRender.unmount()

    renderAt('/practice/hiragana/a-row')
    expect(screen.getByText('Kana Quiz')).toBeInTheDocument()
  })
})
