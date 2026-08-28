import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHOUON_CATEGORY_ID, DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID, SOKUON_CATEGORY_ID, YOUON_CATEGORY_ID } from '../data/curriculum'
import { INTRO_GUIDE_CONTENT, DEFAULT_INTRO_GUIDE_LOCALE } from '../data/introGuideContent'
import { KANA_INTRO_EXCERPT_GUIDE_CONTENT, DEFAULT_KANA_INTRO_EXCERPT_GUIDE_LOCALE } from '../data/kanaIntroExcerptGuideContent'
import {
  ASK_TAMAMIZU_CHOUON,
  ASK_TAMAMIZU_HIRAGANA,
  ASK_TAMAMIZU_KATAKANA,
  ASK_TAMAMIZU_SOKUON,
  ASK_TAMAMIZU_YOUON,
} from '../data/askTamamizu'
import { useProgressStore } from '../store/progressStore'
import { CategoryRowsPage } from './CategoryRowsPage'

function renderKatakana() {
  return render(
    <MemoryRouter>
      <CategoryRowsPage title="カタカナ" description="" categoryIds={[KATAKANA_CATEGORY_ID]} />
    </MemoryRouter>,
  )
}

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))
vi.mock('../hooks/useTTS', () => ({ useTTS: () => tts }))

const introLocale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]
const excerptLocale = KANA_INTRO_EXCERPT_GUIDE_CONTENT[DEFAULT_KANA_INTRO_EXCERPT_GUIDE_LOCALE]

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  tts.speak.mockReset()
  tts.stop.mockReset()
})

function renderHiragana() {
  return render(
    <MemoryRouter>
      <CategoryRowsPage title="ひらがな" description="" categoryIds={[DEFAULT_CATEGORY_ID]} />
    </MemoryRouter>,
  )
}

// Issue #25: this page shows the Recommended decoration on exactly the row
// matching the single Global Recommended Target (useCurriculum's
// globalRecommendedTarget) — no per-activity detail needed here, just
// which row.
describe('CategoryRowsPage Recommended row (Issue #25)', () => {
  it('a-row is Recommended before anything is learned', () => {
    const { getAllByText } = renderHiragana()
    expect(getAllByText('⭐ Recommended')).toHaveLength(1)
  })

  it('moves to ka-row once a-row is fully done', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'listening')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'wordBuilder')
    const { getAllByText, getByText } = renderHiragana()
    expect(getAllByText('⭐ Recommended')).toHaveLength(1)
    // ka-row's own card, not a-row's, carries it.
    expect(getByText('か〜こ').closest('a')?.textContent).toMatch(/Recommended/)
  })

  it('shows no Recommended row for a different category once its target has moved elsewhere', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'kanaQuiz')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'listening')
    useProgressStore.getState().markRowActivityCompleted('a-row', 'wordBuilder')
    const { queryByText } = render(
      <MemoryRouter>
        <CategoryRowsPage title="カタカナ" description="" categoryIds={[KATAKANA_CATEGORY_ID]} />
      </MemoryRouter>,
    )
    // Hiragana isn't fully done yet (only a-row), so the target is still
    // ka-row (hiragana) — no katakana row is Recommended yet.
    expect(queryByText('⭐ Recommended')).toBeNull()
  })
})

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="landed-path">{`${location.pathname}${location.search}`}</div>
}

function renderSection(categoryId: string, title: string) {
  const variant = categoryId === KATAKANA_CATEGORY_ID ? 'katakana' : 'hiragana'
  // Search-param changes (the replay target) don't change the matched
  // route, so LocationDisplay is rendered alongside the page directly
  // rather than via a separate wildcard Route.
  return render(
    <MemoryRouter initialEntries={['/section']}>
      <LocationDisplay />
      <CategoryRowsPage title={title} description="" categoryIds={[categoryId]} askTamamizuKanaIntroVariant={variant} />
    </MemoryRouter>,
  )
}

function askTamamizuAsset(categoryId: string) {
  return categoryId === KATAKANA_CATEGORY_ID ? ASK_TAMAMIZU_KATAKANA : ASK_TAMAMIZU_HIRAGANA
}

// Issue #46 / Ask Tamamizu: the Hiragana and Katakana section pages both get
// the same always-available "Ask Tamamizu" image button that replays the
// two-step Introduction excerpt ("kana represent sounds" -> "Hiragana vs
// Katakana usage"), reusing PR #43's step data/copy/audio verbatim rather
// than a new standalone Guide. The old generic text button/label is gone —
// the image itself (with distinct Hiragana/Katakana artwork) carries the
// call to action, and its accessible name comes from aria-label alone.
describe.each([
  ['Hiragana', DEFAULT_CATEGORY_ID],
  ['Katakana', KATAKANA_CATEGORY_ID],
])('%s section Ask Tamamizu kana-intro replay button (Issue #46)', (title, categoryId) => {
  it('no longer shows the old generic "Hiragana & Katakana Guide" text button', () => {
    const { queryByText } = renderSection(categoryId, title)
    expect(queryByText(excerptLocale.buttonLabel)).toBeNull()
  })

  it('shows the Ask Tamamizu image button with the correct asset and aria-label', () => {
    const asset = askTamamizuAsset(categoryId)
    const { getByRole } = renderSection(categoryId, title)
    const button = getByRole('button', { name: asset.ariaLabel })
    expect(button).toBeInTheDocument()
    const img = button.querySelector('img')
    expect(img).toHaveAttribute('src', expect.stringContaining(asset.imageAsset))
    expect(img).toHaveAttribute('alt', '')
  })

  it('does not render "Ask Tamamizu about..." as visible text outside the button aria-label', () => {
    const asset = askTamamizuAsset(categoryId)
    const { queryByText } = renderSection(categoryId, title)
    expect(queryByText(asset.ariaLabel)).toBeNull()
  })

  it('replays exactly the kana-sounds then kana-usage Introduction steps, in order, and no other step', () => {
    const asset = askTamamizuAsset(categoryId)
    const { getByRole, getByText, queryByText, getByTestId } = renderSection(categoryId, title)

    fireEvent.click(getByRole('button', { name: asset.ariaLabel }))

    expect(getByTestId('kana-intro-excerpt-guide')).toBeInTheDocument()
    expect(getByText(introLocale.steps['intro.kanaSounds'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenCalledWith(
      introLocale.steps['intro.kanaSounds'].audioKey,
      introLocale.steps['intro.kanaSounds'].subtitle,
      introLocale.lang,
    )
    expect(queryByText(introLocale.steps['intro.welcome'].subtitle)).toBeNull()
    expect(queryByText(introLocale.steps['intro.kanjiMeaning'].subtitle)).toBeNull()

    fireEvent.click(getByText(excerptLocale.nextLabel))

    expect(getByText(introLocale.steps['intro.kanaUsage'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenCalledWith(
      introLocale.steps['intro.kanaUsage'].audioKey,
      introLocale.steps['intro.kanaUsage'].subtitle,
      introLocale.lang,
    )
    expect(queryByText(introLocale.steps['intro.kanaSounds'].subtitle)).toBeNull()
  })

  it('stops audio on Next, on finishing the last step, and on Close, without touching Introduction or progress state', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    useProgressStore.getState().markRowTaught('a-row')
    const before = useProgressStore.getState()
    const guard = {
      hasCompletedIntroGuide: before.hasCompletedIntroGuide,
      taughtRowIds: before.taughtRowIds,
      rowActivityCompletion: before.rowActivityCompletion,
      characters: before.characters,
      words: before.words,
      unlockedRowIds: before.unlockedRowIds,
      lastStudied: before.lastStudied,
    }
    const asset = askTamamizuAsset(categoryId)
    const { getByText, getByRole, queryByTestId } = renderSection(categoryId, title)

    fireEvent.click(getByRole('button', { name: asset.ariaLabel }))
    tts.stop.mockClear()
    fireEvent.click(getByText(excerptLocale.nextLabel))
    expect(tts.stop).toHaveBeenCalledOnce()

    tts.stop.mockClear()
    fireEvent.click(getByText(excerptLocale.doneLabel))
    // Finishing dismisses the guide, which also unmounts it (see the
    // unmount-stop test below) — like every other Guide's dismiss button in
    // this codebase, that's an explicit stop() plus the unmount cleanup's
    // own stop(), so this only asserts "stopped," not an exact call count.
    expect(tts.stop).toHaveBeenCalled()
    expect(queryByTestId('kana-intro-excerpt-guide')).toBeNull()

    fireEvent.click(getByRole('button', { name: asset.ariaLabel }))
    tts.stop.mockClear()
    fireEvent.click(getByText(excerptLocale.closeLabel))
    expect(tts.stop).toHaveBeenCalled()
    expect(queryByTestId('kana-intro-excerpt-guide')).toBeNull()

    const after = useProgressStore.getState()
    expect({
      hasCompletedIntroGuide: after.hasCompletedIntroGuide,
      taughtRowIds: after.taughtRowIds,
      rowActivityCompletion: after.rowActivityCompletion,
      characters: after.characters,
      words: after.words,
      unlockedRowIds: after.unlockedRowIds,
      lastStudied: after.lastStudied,
    }).toEqual(guard)
  })

  it('stops audio when the guide unmounts', () => {
    const asset = askTamamizuAsset(categoryId)
    const { getByRole, unmount } = renderSection(categoryId, title)

    fireEvent.click(getByRole('button', { name: asset.ariaLabel }))
    tts.stop.mockClear()
    unmount()

    expect(tts.stop).toHaveBeenCalled()
  })

  it('dismissing removes the replay target and restores the normal section, reload-safe', () => {
    const asset = askTamamizuAsset(categoryId)
    const { getByText, getByRole, queryByTestId, getByTestId } = renderSection(categoryId, title)

    fireEvent.click(getByRole('button', { name: asset.ariaLabel }))
    expect(getByTestId('landed-path')).toHaveTextContent('/section?guide=kanaIntro')

    fireEvent.click(getByText(excerptLocale.closeLabel))

    expect(queryByTestId('kana-intro-excerpt-guide')).toBeNull()
    expect(getByTestId('landed-path')).toHaveTextContent('/section')
  })
})

function renderOtherPage() {
  return render(
    <MemoryRouter initialEntries={['/other']}>
      <Routes>
        <Route
          path="/other"
          element={
            <CategoryRowsPage title="っ＆ー" description="" categoryIds={[SOKUON_CATEGORY_ID, CHOUON_CATEGORY_ID]} />
          }
        />
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Issue #46/Chōon Guide/Ask Tamamizu: the always-visible Sokuon and Chōon
// category explanations, and their old "View X Guide" text buttons, are
// each replaced by an always-available "Ask Tamamizu" image button that
// opens the matching concept Guide on its real screen. The underlying
// `explanation` data is left untouched in curriculum.ts.
describe('Sokuon section Guide replay (Issue #46)', () => {
  it('no longer shows the old always-visible Sokuon explanation', () => {
    const { queryByText } = renderOtherPage()
    expect(queryByText(/Sokuon is a short pause/)).toBeNull()
  })

  it('no longer shows the old "View Sokuon Guide" text button', () => {
    const { queryByText } = renderOtherPage()
    expect(queryByText('View Sokuon Guide')).toBeNull()
  })

  it('always shows the Ask Tamamizu (small tsu) image button', () => {
    useProgressStore.getState().setHasCompletedSokuonGuide(true)
    const { getByRole } = renderOtherPage()
    const button = getByRole('button', { name: ASK_TAMAMIZU_SOKUON.ariaLabel })
    const img = button.querySelector('img')
    expect(img).toHaveAttribute('src', expect.stringContaining(ASK_TAMAMIZU_SOKUON.imageAsset))
    expect(img).toHaveAttribute('alt', '')
  })

  it('does not render "Ask Tamamizu about small tsu" as visible text outside the button aria-label', () => {
    const { queryByText } = renderOtherPage()
    expect(queryByText(ASK_TAMAMIZU_SOKUON.ariaLabel)).toBeNull()
  })

  it('opens the Sokuon Guide replay target on its real screen without changing hasCompletedSokuonGuide', () => {
    useProgressStore.getState().setHasCompletedSokuonGuide(true)
    const { getByRole, getByTestId } = renderOtherPage()

    fireEvent.click(getByRole('button', { name: ASK_TAMAMIZU_SOKUON.ariaLabel }))

    expect(getByTestId('landed-path')).toHaveTextContent('/practice/sokuon/sokuon-row?guide=sokuon')
    expect(useProgressStore.getState().hasCompletedSokuonGuide).toBe(true)
  })
})

// Similar Letters: a supplementary comparison-lesson card added to the
// Hiragana and Katakana sections, immediately left of Summary — see
// data/similarLetters.ts.
describe('Similar Letters entry card', () => {
  it("shows a Similar Letters card on the Hiragana section, immediately left of (before) Summary", () => {
    const { getByText } = renderHiragana()
    const similarCard = getByText(/Similar Letters/).closest('a')
    const summaryCard = getByText(/あ〜ん/).closest('a')
    expect(similarCard).not.toBeNull()
    expect(summaryCard).not.toBeNull()
    // DOCUMENT_POSITION_FOLLOWING (4): summaryCard comes AFTER similarCard.
    expect(similarCard!.compareDocumentPosition(summaryCard!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows a Similar Letters card on the Katakana section too', () => {
    const { getByText } = renderKatakana()
    expect(getByText(/Similar Letters/)).toBeInTheDocument()
  })

  it('is never shown as a 5th top-level script category on Home (only inside Hiragana/Katakana sections)', () => {
    const { queryByText } = renderKatakana()
    // Sanity: it's present on the section page itself...
    expect(queryByText(/Similar Letters/)).toBeInTheDocument()
  })

  it('uses the same (unconditional) unlock condition as Summary — always accessible, never shows 🔒', () => {
    const { getByText } = renderHiragana()
    const similarCard = getByText(/Similar Letters/).closest('div[class*="rounded-xl"]')
    expect(similarCard?.textContent).not.toMatch(/🔒/)
    expect(getByText('similar letters')).toBeInTheDocument()
  })

  it('links to the Practice Hub for its own synthetic row', () => {
    const { getByText } = renderHiragana()
    const link = getByText(/Similar Letters/).closest('a')
    expect(link).toHaveAttribute('href', '/practice/hiragana/hiragana-similar-letters')
  })
})

describe('Chōon section Guide replay', () => {
  it('no longer shows the old always-visible Chōon explanation', () => {
    const { queryByText } = renderOtherPage()
    expect(queryByText(/Chōon means a "long vowel"/)).toBeNull()
  })

  it('no longer shows the old "View Chōon Guide" text button', () => {
    const { queryByText } = renderOtherPage()
    expect(queryByText('View Chōon Guide')).toBeNull()
  })

  it('always shows the Ask Tamamizu (long vowels) image button', () => {
    useProgressStore.getState().setHasCompletedChouonGuide(true)
    const { getByRole } = renderOtherPage()
    const button = getByRole('button', { name: ASK_TAMAMIZU_CHOUON.ariaLabel })
    const img = button.querySelector('img')
    expect(img).toHaveAttribute('src', expect.stringContaining(ASK_TAMAMIZU_CHOUON.imageAsset))
    expect(img).toHaveAttribute('alt', '')
  })

  it('does not render "Ask Tamamizu about long vowels" as visible text outside the button aria-label', () => {
    const { queryByText } = renderOtherPage()
    expect(queryByText(ASK_TAMAMIZU_CHOUON.ariaLabel)).toBeNull()
  })

  it('opens the Chōon Guide replay target on its real screen without changing hasCompletedChouonGuide', () => {
    useProgressStore.getState().setHasCompletedChouonGuide(true)
    const { getByRole, getByTestId } = renderOtherPage()

    fireEvent.click(getByRole('button', { name: ASK_TAMAMIZU_CHOUON.ariaLabel }))

    expect(getByTestId('landed-path')).toHaveTextContent('/practice/chouon/chouon-a-row?guide=chouon')
    expect(useProgressStore.getState().hasCompletedChouonGuide).toBe(true)
  })
})

// Explicit cross-check (spec item F): every Ask Tamamizu entry point uses a
// distinct image asset — guards against an accidental copy-paste mixup
// between Sokuon/Chōon/Yōon (and separately, Hiragana/Katakana above).
describe('Ask Tamamizu asset mapping (no copy-paste mixups)', () => {
  it('Sokuon, Chōon, and Yōon use three distinct image assets', () => {
    const assets = [ASK_TAMAMIZU_SOKUON.imageAsset, ASK_TAMAMIZU_CHOUON.imageAsset, ASK_TAMAMIZU_YOUON.imageAsset]
    expect(new Set(assets).size).toBe(3)
  })

  it('Hiragana and Katakana use two distinct image assets', () => {
    expect(ASK_TAMAMIZU_HIRAGANA.imageAsset).not.toBe(ASK_TAMAMIZU_KATAKANA.imageAsset)
  })
})

function renderYouonPage() {
  return render(
    <MemoryRouter initialEntries={['/youon']}>
      <Routes>
        <Route path="/youon" element={<CategoryRowsPage title="拗音" description="" categoryIds={[YOUON_CATEGORY_ID]} />} />
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Issue #50/Ask Tamamizu: the always-visible Yōon category explanation
// duplicates the new Yōon Guide's content, so it's replaced by an
// always-available "Ask Tamamizu" image button, matching Sokuon/Chōon's
// Issue #46 precedent.
describe('Yōon section Guide replay (Issue #50)', () => {
  it('no longer shows the old always-visible Yōon explanation', () => {
    const { queryByText } = renderYouonPage()
    expect(queryByText(/Yōon are contracted sounds/)).toBeNull()
  })

  it('no longer shows the old "View Yōon Guide" text button', () => {
    const { queryByText } = renderYouonPage()
    expect(queryByText('View Yōon Guide')).toBeNull()
  })

  it('always shows the Ask Tamamizu (small youon) image button', () => {
    useProgressStore.getState().setHasCompletedYouonGuide(true)
    const { getByRole } = renderYouonPage()
    const button = getByRole('button', { name: ASK_TAMAMIZU_YOUON.ariaLabel })
    const img = button.querySelector('img')
    expect(img).toHaveAttribute('src', expect.stringContaining(ASK_TAMAMIZU_YOUON.imageAsset))
    expect(img).toHaveAttribute('alt', '')
  })

  it('does not render "Ask Tamamizu about small ya yu yo sounds" as visible text outside the button aria-label', () => {
    const { queryByText } = renderYouonPage()
    expect(queryByText(ASK_TAMAMIZU_YOUON.ariaLabel)).toBeNull()
  })

  it('opens the Yōon Guide replay target on its real screen without changing hasCompletedYouonGuide', () => {
    useProgressStore.getState().setHasCompletedYouonGuide(true)
    const { getByRole, getByTestId } = renderYouonPage()

    fireEvent.click(getByRole('button', { name: ASK_TAMAMIZU_YOUON.ariaLabel }))

    expect(getByTestId('landed-path')).toHaveTextContent('/practice/youon/youon-ka-row?guide=youon')
    expect(useProgressStore.getState().hasCompletedYouonGuide).toBe(true)
  })
})
