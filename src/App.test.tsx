import { fireEvent, render, screen } from '@testing-library/react'
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
  // These are routing tests, not onboarding tests — suppress the Tamamizu
  // Guide overlay (see components/IntroGuide.tsx) so it never covers/
  // duplicates the page content under test. IntroGuide has its own
  // dedicated tests.
  useProgressStore.getState().setHasCompletedIntroGuide(true)
})

describe('routing', () => {
  it('/ renders the home page', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })

  it('/practice/hiragana/a-row renders that row\'s Practice Hub', () => {
    renderAt('/practice/hiragana/a-row')
    expect(screen.getByRole('heading', { name: 'あ〜お' })).toBeInTheDocument()
  })

  it('/learn/hiragana/a-row renders the Learn flow for that row', () => {
    renderAt('/learn/hiragana/a-row')
    expect(screen.getByText(/new characters/)).toBeInTheDocument()
  })

  it('/practice/hiragana/a-row/kana-quiz renders the Kana Quiz game directly, with no mode selector', () => {
    renderAt('/practice/hiragana/a-row/kana-quiz')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('does not interrupt an active question with the Review Guide even when Review has a target', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    renderAt('/practice/hiragana/a-row/kana-quiz')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
    expect(screen.queryByTestId('review-guide')).toBeNull()
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
    expect(screen.getByRole('heading', { name: 'ア〜オ・カ〜ゴ・ン・ー' })).toBeInTheDocument()
  })

  it('/learn/katakana/katakana-a-row renders the Learn flow for that row', () => {
    renderAt('/learn/katakana/katakana-a-row')
    expect(screen.getByText(/new characters/)).toBeInTheDocument()
  })

  it('/practice/katakana/katakana-a-row/kana-quiz renders the Kana Quiz game directly, with no mode selector', () => {
    renderAt('/practice/katakana/katakana-a-row/kana-quiz')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('an unknown row id redirects home', () => {
    renderAt('/practice/hiragana/not-a-real-row')
    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })

  it('/practice/review shows a "nothing to review yet" message (not a silent redirect) until at least one row is taught', () => {
    renderAt('/practice/review')
    expect(screen.getByRole('heading', { name: 'Nothing to review yet' })).toBeInTheDocument()
  })

  it('/practice/review shows a Review-complete success state once a row is taught but nothing is active in Review', () => {
    useProgressStore.getState().markRowTaught('a-row')
    renderAt('/practice/review')
    expect(screen.getByRole('heading', { name: 'Review complete!' })).toBeInTheDocument()
  })

  it('/practice/review renders the normal hub once something is active in Review', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    renderAt('/practice/review')
    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()
  })

  it('/practice/review/kana-quiz renders the review-scoped Kana Quiz once a character is active in Review', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    renderAt('/practice/review/kana-quiz')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('the old pre-migration URL shape (no category segment) does not match any route', () => {
    renderAt('/practice/a-row')
    // No route pattern matches a single-segment /practice/:x anymore, so
    // React Router renders nothing inside <Routes> — just confirm this
    // doesn't crash and doesn't accidentally render the Practice Hub.
    expect(screen.queryByRole('heading', { name: 'あ〜お' })).not.toBeInTheDocument()
  })
})

// The four top-level script pages (see HomePage.tsx's chooser cards and
// App.tsx's OTHER_CATEGORY_IDS) — replaced the single flat HomePage that
// used to stack every category's rows on one page.
describe('script chooser pages', () => {
  it('/hiragana shows only hiragana rows', () => {
    renderAt('/hiragana')
    expect(screen.getByRole('heading', { name: 'ひらがな' })).toBeInTheDocument()
    expect(screen.getByText('あ〜お')).toBeInTheDocument()
    expect(screen.queryByText('ア〜オ・カ〜ゴ・ン・ー')).not.toBeInTheDocument()
  })

  it('/katakana shows only katakana rows', () => {
    renderAt('/katakana')
    expect(screen.getByRole('heading', { name: 'カタカナ' })).toBeInTheDocument()
    expect(screen.getByText('ア〜オ')).toBeInTheDocument()
    expect(screen.getByText('カ〜コ')).toBeInTheDocument()
    expect(screen.getByText('ガ〜ゴ')).toBeInTheDocument()
    expect(screen.getByText('ン・ー')).toBeInTheDocument()
    expect(screen.queryByText('あ〜お')).not.toBeInTheDocument()
  })

  // 拗音 now has its own page (see App.tsx's /youon route), separate from
  // そのほか — the user's explicit request, since it has enough rows
  // ("セッションがたくさんある") to deserve one. Its page title is
  // ScriptCategory.displayLabel ('ゃゅょ'), not the kanji '拗音' — the
  // target audience may not read any kana yet, let alone kanji. Special
  // Katakana (see curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID) is now
  // bundled onto this SAME page as a continuation of Yōon — a real second
  // category, so it DOES get its own h2 subheading (like /other's ○+っ/○+ー
  // below), unlike the old single-category shape this test used to cover.
  it('/youon shows yōon rows AND Special Katakana rows, each under its own subheading', () => {
    renderAt('/youon')
    expect(screen.getByRole('heading', { name: 'ゃゅょ', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('きゃ・きゅ・きょ')).toBeInTheDocument()
    expect(screen.getByText('ぎゃ・ぎゅ・ぎょ')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ゃゅょ', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Special Katakana', level: 2 })).toBeInTheDocument()
    // Special Katakana's `explanation` copy is replaced by an "Ask Tamamizu"
    // image button (see CategoryRowsPage.tsx), same as Sokuon/Chōon/Yōon.
    expect(screen.getByTestId('ask-tamamizu-special-katakana')).toBeInTheDocument()
    // Row cards show `displayLines`, not the raw `label` — see RowMap.tsx.
    expect(screen.getByText('ファ・フィ・フェ・フォ')).toBeInTheDocument()
    expect(screen.getByText('ティ・ディ')).toBeInTheDocument()
    expect(screen.getByText('シェ・ジェ・チェ')).toBeInTheDocument()
    expect(screen.getByText('ウィ・ウェ・ウォ')).toBeInTheDocument()
    expect(screen.queryByText('っ・ッ')).not.toBeInTheDocument()
    expect(screen.queryByText('あー')).not.toBeInTheDocument()
  })

  // OTHER_CATEGORY_IDS (App.tsx) is computed from CATEGORIES, so /other
  // shows real rows for every non-hiragana/katakana/拗音 category (促音/
  // 長音) automatically now that they exist, not the empty state — and
  // shows each category's own subheading (displayLabel, kanji-free) since
  // it bundles more than one.
  it('/other shows rows from 促音 and 長音, each under its own subheading, but not 拗音', () => {
    renderAt('/other')
    expect(screen.getByRole('heading', { name: 'っ・ー' })).toBeInTheDocument()
    expect(screen.queryByText('まだ利用できるレッスンがありません。')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '○+っ' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '○+ー' })).toBeInTheDocument()
    expect(screen.getByText('っ・ッ')).toBeInTheDocument()
    expect(screen.getByText('あー')).toBeInTheDocument()
    expect(screen.getByText('ー')).toBeInTheDocument()
    expect(screen.queryByText('きゃ・きゅ・きょ・ぎゃ・ぎゅ・ぎょ')).not.toBeInTheDocument()
    expect(screen.queryByText('あ〜お')).not.toBeInTheDocument()
    expect(screen.queryByText('ア〜オ・カ〜ゴ・ン・ー')).not.toBeInTheDocument()
  })

  it('home page links to all four script pages, each paired with an English label', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: /ひらがな.*Hiragana/s })).toHaveAttribute('href', '/hiragana')
    expect(screen.getByRole('link', { name: /カタカナ.*Katakana/s })).toHaveAttribute('href', '/katakana')
    expect(screen.getByRole('link', { name: /ゃゅょ.*Yōon/s })).toHaveAttribute('href', '/youon')
    expect(screen.getByRole('link', { name: /っ・ー.*Stop & Long Sound/s })).toHaveAttribute('href', '/other')
  })
})

// HubBreadcrumb (see components/HubBreadcrumb.tsx) — prev/next-row quick
// links between rows in the same category, using `GojuonRow.englishLabel`
// (a short romaji "session name") for a learner who can't yet read a row's
// kana `label`. Used to also show a Home/category/row breadcrumb trail;
// dropped once NavBar's script-jump row made section-level navigation
// redundant here (the user's explicit request).
describe('Practice Hub cross-session navigation', () => {
  it('a middle row shows both prev/next quick links to adjacent rows in the same category', () => {
    renderAt('/practice/katakana/katakana-sa-row')
    expect(screen.getByRole('link', { name: /A Row/ })).toHaveAttribute('href', '/practice/katakana/katakana-a-row')
    expect(screen.getByRole('link', { name: /Ta Row/ })).toHaveAttribute('href', '/practice/katakana/katakana-ta-row')
  })

  it('the first row in a category has no prev link', () => {
    renderAt('/practice/katakana/katakana-a-row')
    expect(screen.queryByRole('link', { name: /^‹/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sa Row/ })).toBeInTheDocument()
  })

  it('the last real row in a category links next to its ⭐ summary row', () => {
    renderAt('/practice/katakana/katakana-ra-row')
    expect(screen.getByRole('link', { name: /›$/ })).toBeInTheDocument()
  })

  it('the ⭐ summary row itself has no next link', () => {
    renderAt('/practice/katakana/katakana-summary')
    expect(screen.queryByRole('link', { name: /›$/ })).not.toBeInTheDocument()
  })

  it('prev/next links do not cross category boundaries (regression)', () => {
    // sokuon-row is the only row in its category, so both should be absent.
    renderAt('/practice/sokuon/sokuon-row')
    expect(screen.queryByRole('link', { name: /Row/ })).not.toBeInTheDocument()
  })

})

// Learn's step-A jump-ahead links (see LearnPage.tsx) — added because
// katakana's merged ア~ゴ lesson has enough characters that clicking Next
// through every one just to reach the recap grid or word list is a lot of
// taps; these skip straight there.
describe('Learn jump-ahead links', () => {
  it('"See them all" jumps straight to the recap grid from the first character', () => {
    renderAt('/learn/katakana/katakana-a-row')
    expect(screen.getByText(/new characters/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('See them all'))
    expect(screen.getByText(/all together/)).toBeInTheDocument()
  })

  it('"See the words" jumps straight to the word list from the first character', () => {
    renderAt('/learn/katakana/katakana-a-row')
    fireEvent.click(screen.getByText('See the words'))
    expect(screen.getByText(/words you can already read/)).toBeInTheDocument()
  })

  it('"Back" from a later character still steps back one at a time, not straight to the hub', () => {
    // katakana-a-row is now micro-batched (5/5/5/2, see curriculum.ts's
    // learnBatches) — the position indicator reflects the current SET, not
    // the row's full 17-character count. See LearnPage.test.tsx for
    // dedicated micro-batch coverage.
    renderAt('/learn/katakana/katakana-a-row')
    fireEvent.click(screen.getByText('Next')) // charIndexInBatch 0 -> 1
    expect(screen.getByText('Set 1 / 4 · 2 / 5')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back')) // charIndexInBatch 1 -> 0, not the hub
    expect(screen.getByText('Set 1 / 4 · 1 / 5')).toBeInTheDocument()
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

// 長音 (chōon) is also 'contrast-pairs', but every one of its rows has
// characterIds: [] (see curriculum.ts's chouon-*-row comment) — the first
// real test of the "zero new characters" path docs/curriculum-
// extensibility.md flagged as future-proofed-but-untested when sokuon's
// generalization landed. These tests prove Learn/Practice/Tracing all
// handle an empty characterIds row the same way they handle sokuon's
// non-empty one, with no crash and no broken/empty screen. Targets
// chouon-katakana-row specifically (any of the 6 rows would do for this
// plumbing check; this one's label happens to still be 'ー').
describe('contrast-pairs learnStyle with zero new characters (chōon)', () => {
  it('/practice/chouon/chouon-katakana-row renders that row\'s Practice Hub', () => {
    renderAt('/practice/chouon/chouon-katakana-row')
    expect(screen.getByRole('heading', { name: 'ー' })).toBeInTheDocument()
  })

  it('the chouon Practice Hub offers Learn, Tracing, and 3 games, but NOT Kana Quiz', () => {
    renderAt('/practice/chouon/chouon-katakana-row')
    expect(screen.getByRole('link', { name: /Learn/ })).toBeInTheDocument()
    expect(screen.getByText('Tracing')).toBeInTheDocument()
    expect(screen.getByText('Word Builder')).toBeInTheDocument()
    expect(screen.getByText('Listening')).toBeInTheDocument()
    expect(screen.getByText('Kana Typing')).toBeInTheDocument()
    expect(screen.queryByText('Kana Quiz')).not.toBeInTheDocument()
  })

  it('/learn/chouon/chouon-katakana-row skips the flashcard step (no characters to flashcard), shows the row explanation, and goes straight to the word list', () => {
    renderAt('/learn/chouon/chouon-katakana-row')
    expect(screen.getByText(/listen and compare/)).toBeInTheDocument()
    expect(screen.queryByText(/new characters/)).not.toBeInTheDocument()
    // The row's explanation (GojuonRow.explanation) renders above the word
    // grid for a row that has one.
    expect(screen.getByText(/Katakana never has this problem/)).toBeInTheDocument()
    // The word list itself must actually render real content, not an
    // empty grid — confirms an empty characterIds row doesn't also end up
    // with an empty word list.
    // Rendered via UnbreakableKana (one non-breaking span per mora — see
    // "fix: polish section labels and similar-letter support"), so the
    // word's kana is split across sibling elements rather than one text
    // node; assert on the page's combined text content instead.
    expect(document.body.textContent).toContain('ビル')
  })

  it('/practice/chouon/chouon-katakana-row/tracing starts directly in the word phase, and does not crash despite an empty character pool', () => {
    renderAt('/practice/chouon/chouon-katakana-row/tracing')
    expect(screen.getByText('Trace each word')).toBeInTheDocument()
    expect(screen.queryByText('Trace each character')).not.toBeInTheDocument()
  })

  it('direct navigation to the chouon Kana Quiz route redirects home rather than rendering', () => {
    renderAt('/practice/chouon/chouon-katakana-row/kana-quiz')
    expect(screen.getByRole('heading', { name: 'Kana Game' })).toBeInTheDocument()
  })

  it('/practice/chouon/chouon-katakana-row/word-builder still renders normally, drawing distractor tiles from the full hiragana+katakana pool', () => {
    renderAt('/practice/chouon/chouon-katakana-row/word-builder')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('/practice/chouon/chouon-katakana-row/listening still renders normally', () => {
    renderAt('/practice/chouon/chouon-katakana-row/listening')
    expect(screen.getByText(/Round 1/)).toBeInTheDocument()
  })

  it('a different chouon row (chouon-a-row) also renders correctly, with its own explanation and words (regression: not just the one row tested above)', () => {
    renderAt('/learn/chouon/chouon-a-row')
    expect(screen.getByText(/listen and compare/)).toBeInTheDocument()
    expect(screen.getByText(/①ア段/)).toBeInTheDocument()
    // See the ビル assertion above for why this checks combined text content
    // rather than getByText.
    expect(document.body.textContent).toContain('おかあさん')
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

  // Word Builder keeps a multi-glyph character like きゃ as ONE pre-combined
  // tile, never split into separate き/ゃ tiles — see WordBuilderPage.tsx's
  // TrayTile comment (this reverses an earlier explicit request; the mora
  // unit is now used everywhere, including existing yōon words — see the
  // Special Katakana spec's explicit tile-unit requirement). Every word in
  // youon-ka-row contains exactly one small ゃ/ゅ/ょ combo character, so
  // regardless of which word the session picks, some button's accessible
  // text should be exactly that 2-glyph combo — never split into a bare
  // small ゃ/ゅ/ょ tile on its own.
  it('/practice/youon/youon-ka-row/word-builder keeps yōon combo characters as one tile, never split into separate glyph tiles', () => {
    renderAt('/practice/youon/youon-ka-row/word-builder')
    const buttonTexts = screen.getAllByRole('button').map((b) => b.textContent)
    // Some tile shows a full 2-glyph combo like きゃ/ぎょ.
    expect(buttonTexts.some((t) => t != null && [...t].length === 2 && /[ぁ-ん]/.test(t))).toBe(true)
    // Regression: no tile should show a bare small ゃ/ゅ/ょ on its own.
    expect(buttonTexts.some((t) => t === 'ゃ' || t === 'ゅ' || t === 'ょ')).toBe(false)
  })

  it('sokuon/chōon/hiragana/katakana behavior is unaffected by youon existing (regression)', () => {
    renderAt('/practice/sokuon/sokuon-row')
    expect(screen.getByRole('heading', { name: 'っ・ッ' })).toBeInTheDocument()
    expect(screen.queryByText('Kana Quiz')).not.toBeInTheDocument()

    renderAt('/practice/hiragana/a-row')
    expect(screen.getByText('Kana Quiz')).toBeInTheDocument()
  })
})

// Shortened category-page descriptions (mobile readability pass) — exact
// replacement copy for all four script-group pages.
describe('category page descriptions (shortened copy)', () => {
  it('Hiragana page shows the shortened description', () => {
    renderAt('/hiragana')
    expect(screen.getByText('Learn hiragana with everyday words.')).toBeInTheDocument()
  })

  it('Katakana page shows the shortened description', () => {
    renderAt('/katakana')
    expect(screen.getByText('Learn katakana with everyday words.')).toBeInTheDocument()
  })

  it('Yōon page shows the shortened description', () => {
    renderAt('/youon')
    expect(screen.getByText('Learn small ゃゅょ sounds like きゃ / kya.')).toBeInTheDocument()
  })

  it('Sokuon/Chōon (っ・ー) page shows the shortened description', () => {
    renderAt('/other')
    expect(screen.getByText('Learn small っ/ッ and long vowel ー.')).toBeInTheDocument()
  })
})
