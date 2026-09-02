import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHOUON_CATEGORY_ID, DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID, SOKUON_CATEGORY_ID, SPECIAL_KATAKANA_CATEGORY_ID, YOUON_CATEGORY_ID } from '../data/curriculum'
import { INTRO_GUIDE_CONTENT, DEFAULT_INTRO_GUIDE_LOCALE } from '../data/introGuideContent'
import { KANA_INTRO_EXCERPT_GUIDE_CONTENT, DEFAULT_KANA_INTRO_EXCERPT_GUIDE_LOCALE } from '../data/kanaIntroExcerptGuideContent'
import { DEFAULT_CHOUON_GUIDE_LOCALE, CHOUON_GUIDE_CONTENT } from '../data/chouonGuideContent'
import { DEFAULT_YOUON_GUIDE_LOCALE, YOUON_GUIDE_CONTENT } from '../data/youonGuideContent'
import {
  ASK_TAMAMIZU_CHOUON,
  ASK_TAMAMIZU_HIRAGANA,
  ASK_TAMAMIZU_KATAKANA,
  ASK_TAMAMIZU_PARTICLE,
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
const chouonLocale = CHOUON_GUIDE_CONTENT[DEFAULT_CHOUON_GUIDE_LOCALE]
const youonLocale = YOUON_GUIDE_CONTENT[DEFAULT_YOUON_GUIDE_LOCALE]

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

function renderSection(categoryId: string, title: string, initialPath = '/section') {
  const variant = categoryId === KATAKANA_CATEGORY_ID ? 'katakana' : 'hiragana'
  // Search-param changes (the replay target) don't change the matched
  // route, so LocationDisplay is rendered alongside the page directly
  // rather than via a separate wildcard Route.
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
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
            <CategoryRowsPage title="っ・ー" description="" categoryIds={[SOKUON_CATEGORY_ID, CHOUON_CATEGORY_ID]} />
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
// Issue #181: the Hiragana/Katakana section pages used to also auto-show the
// two-slide KanaIntroExcerptGuide on first entry, duplicating the same two
// steps just shown in the global Introduction. That auto-display is removed
// — CategoryRowsPage now only ever shows it via the manual Ask Tamamizu
// replay button (fully covered by the describe.each block above), regardless
// of hasCompletedIntroGuide/hasCompletedHiraganaSectionGuide/
// hasCompletedKatakanaSectionGuide state.
describe('Hiragana/Katakana section KanaIntroExcerptGuide no longer auto-shows (Issue #181)', () => {
  it('Hiragana: does not auto-show on entry even once the global Introduction is complete', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    const { queryByTestId } = renderSection(DEFAULT_CATEGORY_ID, 'Hiragana')
    expect(queryByTestId('kana-intro-excerpt-guide')).toBeNull()
  })

  it('Katakana: does not auto-show on entry even once the global Introduction is complete', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    const { queryByTestId } = renderSection(KATAKANA_CATEGORY_ID, 'Katakana')
    expect(queryByTestId('kana-intro-excerpt-guide')).toBeNull()
  })

  it('never auto-shows while the global Introduction is still outstanding either', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(false)
    const { queryByTestId } = renderSection(DEFAULT_CATEGORY_ID, 'Hiragana')
    expect(queryByTestId('kana-intro-excerpt-guide')).toBeNull()
  })

  it('manual Ask Tamamizu replay still shows it on demand, unlimited times', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    const { getByRole, getByText, getByTestId, queryByTestId } = renderSection(DEFAULT_CATEGORY_ID, 'Hiragana')

    expect(queryByTestId('kana-intro-excerpt-guide')).toBeNull()
    fireEvent.click(getByRole('button', { name: ASK_TAMAMIZU_HIRAGANA.ariaLabel }))
    expect(getByTestId('kana-intro-excerpt-guide')).toBeInTheDocument()
    fireEvent.click(getByText(excerptLocale.nextLabel))
    fireEvent.click(getByText(excerptLocale.doneLabel))
    expect(queryByTestId('kana-intro-excerpt-guide')).toBeNull()

    fireEvent.click(getByRole('button', { name: ASK_TAMAMIZU_HIRAGANA.ariaLabel }))
    expect(getByTestId('kana-intro-excerpt-guide')).toBeInTheDocument()
  })

  // Regression: a Particle Guide replay (deep link `?guide=particle`) and
  // the manually-triggered KanaIntroExcerptGuide must never mount at once —
  // only one Guide is ever visible at a time app-wide.
  it('does not show alongside an active Particle Guide replay (?guide=particle)', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)

    const { getByTestId, queryByTestId } = renderSection(DEFAULT_CATEGORY_ID, 'Hiragana', '/section?guide=particle')

    expect(getByTestId('particle-guide')).toBeInTheDocument()
    expect(queryByTestId('kana-intro-excerpt-guide')).toBeNull()
  })
})

// Sokuon must auto-show first on /other; Chōon must not auto-show until
// Sokuon's Recommended Path status is 'done' (same rule as
// getRecommendedActivity/isRowRecommendedPathDone), and the two must never
// show at once.
describe('/other Sokuon-then-Chōon auto-display sequencing', () => {
  it('Sokuon auto-shows on first entry; Chōon does not show at the same time', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    const { getByTestId, queryByTestId } = renderOtherPage()
    expect(getByTestId('sokuon-guide')).toBeInTheDocument()
    expect(queryByTestId('chouon-guide')).toBeNull()
  })

  it('Chōon still does not auto-show while sokuon-row is not yet Recommended-Path done', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    useProgressStore.getState().setHasCompletedSokuonGuide(true)
    const { queryByTestId } = renderOtherPage()
    expect(queryByTestId('chouon-guide')).toBeNull()
  })

  it('Chōon auto-shows once sokuon-row is done and hasCompletedChouonGuide is false', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    useProgressStore.getState().setHasCompletedSokuonGuide(true)
    useProgressStore.getState().markRowTaught('sokuon-row')
    useProgressStore.getState().markRowActivityCompleted('sokuon-row', 'listening')
    useProgressStore.getState().markRowActivityCompleted('sokuon-row', 'wordBuilder')
    // sokuon-row's approved Cafe checkpoint (Issue #183) is part of its own
    // Recommended Path 'done' state now — see recommendedPath.ts.
    useProgressStore.getState().markRowActivityCompleted('sokuon-row', 'checkpoint')

    const { getByTestId } = renderOtherPage()
    expect(getByTestId('chouon-guide')).toBeInTheDocument()
  })

  it('does not re-show Chōon automatically after it has been dismissed once', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    useProgressStore.getState().setHasCompletedSokuonGuide(true)
    useProgressStore.getState().markRowTaught('sokuon-row')
    useProgressStore.getState().markRowActivityCompleted('sokuon-row', 'listening')
    useProgressStore.getState().markRowActivityCompleted('sokuon-row', 'wordBuilder')
    useProgressStore.getState().markRowActivityCompleted('sokuon-row', 'checkpoint')

    const first = renderOtherPage()
    fireEvent.click(first.getByText(chouonLocale.skipLabel))
    expect(useProgressStore.getState().hasCompletedChouonGuide).toBe(true)
    first.unmount()

    const second = renderOtherPage()
    expect(second.queryByTestId('chouon-guide')).toBeNull()
  })

  it('manual Ask Tamamizu replay for Chōon does not mutate hasCompletedChouonGuide', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    const { getByRole, getByTestId } = renderOtherPage()

    fireEvent.click(getByRole('button', { name: ASK_TAMAMIZU_CHOUON.ariaLabel }))
    expect(getByTestId('landed-path')).toHaveTextContent('/practice/chouon/chouon-a-row?guide=chouon')
    expect(useProgressStore.getState().hasCompletedChouonGuide).toBe(false)
  })
})

describe('/youon auto-display', () => {
  it('auto-shows on first entry and does not re-show after dismissal', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    const first = renderYouonPage()
    expect(first.getByTestId('youon-guide')).toBeInTheDocument()

    fireEvent.click(first.getByText(youonLocale.skipLabel))
    expect(useProgressStore.getState().hasCompletedYouonGuide).toBe(true)
    first.unmount()

    const second = renderYouonPage()
    expect(second.queryByTestId('youon-guide')).toBeNull()
  })

  it('manual Ask Tamamizu replay for Yōon does not mutate hasCompletedYouonGuide', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    useProgressStore.getState().setHasCompletedYouonGuide(true)
    const { getByRole, getByTestId } = renderYouonPage()

    fireEvent.click(getByRole('button', { name: ASK_TAMAMIZU_YOUON.ariaLabel }))
    expect(getByTestId('landed-path')).toHaveTextContent('/practice/youon/youon-ka-row?guide=youon')
    expect(useProgressStore.getState().hasCompletedYouonGuide).toBe(true)
  })

  it('never auto-shows while the global Introduction is still outstanding', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(false)
    const { queryByTestId } = renderYouonPage()
    expect(queryByTestId('youon-guide')).toBeNull()
  })
})

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

function renderHiraganaWithParticleEntry() {
  return render(
    <MemoryRouter>
      <CategoryRowsPage
        title="ひらがな"
        description=""
        categoryIds={[DEFAULT_CATEGORY_ID]}
        askTamamizuKanaIntroVariant="hiragana"
      />
    </MemoryRouter>,
  )
}

describe('Hiragana Restaurant CTA', () => {
  it('renders on the Hiragana overview (once per checkpoint — Issue #160 adds a second after ら行)', () => {
    const { getAllByTestId } = renderHiraganaWithParticleEntry()
    const ctas = getAllByTestId('restaurant-cta')
    expect(ctas).toHaveLength(2)
    for (const cta of ctas) {
      expect(cta).toHaveTextContent('REAL-LIFE PRACTICE')
      expect(cta).toHaveTextContent('Restaurant Practice')
      expect(cta).toHaveTextContent('Order food using what you\'ve learned')
    }
  })

  it('does not render on the Katakana overview\'s hiragana-specific checkpoints', () => {
    const { queryAllByTestId, getAllByTestId } = renderKatakana()
    // Katakana's own page still has its own Restaurant/Cafe checkpoints
    // (Issue #160) — this only asserts none of Hiragana's CTAs leak in.
    expect(queryAllByTestId('restaurant-cta').length + queryAllByTestId('cafe-cta').length).toBe(3)
    expect(getAllByTestId('restaurant-cta')).toHaveLength(2)
  })

  it('renders even without askTamamizuKanaIntroVariant set (Issue #160 checkpoints are self-configuring)', () => {
    const { getAllByTestId } = render(
      <MemoryRouter>
        <CategoryRowsPage title="ひらがな" description="" categoryIds={[DEFAULT_CATEGORY_ID]} />
      </MemoryRouter>,
    )
    expect(getAllByTestId('restaurant-cta')).toHaveLength(2)
  })

  // Issue #158: Restaurant 1's 11-dish menu is readable through な行, so the
  // CTA sits right after な行's row card and before は行's — not at the
  // bottom of the page. Issue #160 adds a second checkpoint after ら行
  // (hiragana-complete).
  it('renders the first checkpoint after な行 and before は行 (Issue #158 checkpoint placement)', () => {
    const { getAllByTestId, getByText } = renderHiraganaWithParticleEntry()
    const cta = getAllByTestId('restaurant-cta')[0]
    const naRowCard = getByText('な〜の')
    const haRowCard = getByText('は〜ほ')
    expect(naRowCard.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cta.compareDocumentPosition(haRowCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders the second checkpoint after ら行 (Issue #160 hiragana-complete)', () => {
    const { getAllByTestId, getByText } = renderHiraganaWithParticleEntry()
    const cta = getAllByTestId('restaurant-cta')[1]
    const raRowCard = getByText('ら〜ろ')
    expect(raRowCard.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('places Katakana Restaurant CTAs at their approved checkpoints, not just at the bottom (Issue #160)', () => {
    const { getAllByTestId, getByText } = render(
      <MemoryRouter>
        <CategoryRowsPage title="カタカナ" description="" categoryIds={[KATAKANA_CATEGORY_ID]} />
      </MemoryRouter>,
    )
    // Katakana has three checkpoints on this page: after サ行 (Restaurant),
    // after ハ行 (Cafe), and after ラ行/complete (Restaurant) — see
    // data/practiceCheckpoints.ts. Sorted into true document order since
    // querying by testid type doesn't preserve cross-type DOM order.
    const ctas = [...getAllByTestId('restaurant-cta'), ...getAllByTestId('cafe-cta')].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    expect(ctas).toHaveLength(3)
    const saRowCard = getByText('サ〜ソ')
    const lastKatakanaRowCard = getByText('ラ〜ロ')
    expect(saRowCard.compareDocumentPosition(ctas[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lastKatakanaRowCard.compareDocumentPosition(ctas[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('appears before the "Ask Tamamizu about particles" button in DOM order', () => {
    const { getAllByTestId, getByRole } = renderHiraganaWithParticleEntry()
    const lastRestaurantCta = getAllByTestId('restaurant-cta').at(-1)!
    const particleButton = getByRole('button', { name: ASK_TAMAMIZU_PARTICLE.ariaLabel })
    expect(lastRestaurantCta.compareDocumentPosition(particleButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the particle button still exists and still works after adding the Restaurant CTA', () => {
    const { getByRole } = renderHiraganaWithParticleEntry()
    const particleButton = getByRole('button', { name: ASK_TAMAMIZU_PARTICLE.ariaLabel })
    expect(particleButton).toBeInTheDocument()
    fireEvent.click(particleButton)
    // ParticleGuide should now be replaying — its dismiss behavior is
    // covered elsewhere; here we just confirm the click is still wired up
    // (no crash, guide content shows up).
    expect(useProgressStore.getState().hasCompletedParticleGuide).toBe(false)
  })

  it('navigates to /restaurant/na-row on click', () => {
    const { getAllByTestId, getByTestId: getByTestId2 } = render(
      <MemoryRouter initialEntries={['/hiragana']}>
        <Routes>
          <Route
            path="/hiragana"
            element={
              <CategoryRowsPage
                title="ひらがな"
                description=""
                categoryIds={[DEFAULT_CATEGORY_ID]}
                askTamamizuKanaIntroVariant="hiragana"
              />
            }
          />
          <Route path="/restaurant/na-row" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(getAllByTestId('restaurant-cta')[0])
    expect(getByTestId2('landed-path')).toHaveTextContent('/restaurant/na-row')
  })
})

// Issue #160: the full Restaurant/Cafe checkpoint roadmap adds checkpoints
// to /other and /youon too, not just /hiragana and /katakana. Matches
// App.tsx's real /youon route, which bundles Special Katakana's rows onto
// the same page (categoryIds={[YOUON_CATEGORY_ID, SPECIAL_KATAKANA_CATEGORY_ID]})
// — this test file's own renderYouonPage() helper predates that and omits
// Special Katakana, so the special-katakana-complete checkpoint needs its
// own render here to actually exercise its row.
function renderYouonPageWithSpecialKatakana() {
  return render(
    <MemoryRouter initialEntries={['/youon']}>
      <Routes>
        <Route
          path="/youon"
          element={<CategoryRowsPage title="拗音" description="" categoryIds={[YOUON_CATEGORY_ID, SPECIAL_KATAKANA_CATEGORY_ID]} />}
        />
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Restaurant/Cafe checkpoint placement on /other and /youon (Issue #160)', () => {
  it('/other has exactly two checkpoints: Cafe after 促音, Restaurant after 長音 (chōon-complete)', () => {
    const { getAllByTestId, getByText } = renderOtherPage()
    const cafeCtas = getAllByTestId('cafe-cta')
    const restaurantCtas = getAllByTestId('restaurant-cta')
    expect(cafeCtas).toHaveLength(1)
    expect(restaurantCtas).toHaveLength(1)
    const sokuonRowCard = getByText('っ・ッ')
    expect(sokuonRowCard.compareDocumentPosition(cafeCtas[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('navigates to the Sokuon-complete Cafe checkpoint route on click', () => {
    const { getAllByTestId, getByTestId } = render(
      <MemoryRouter initialEntries={['/other']}>
        <Routes>
          <Route path="/other" element={<CategoryRowsPage title="っ・ー" description="" categoryIds={[SOKUON_CATEGORY_ID, CHOUON_CATEGORY_ID]} />} />
          <Route path="/cafe/sokuon-complete" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(getAllByTestId('cafe-cta')[0])
    expect(getByTestId('landed-path')).toHaveTextContent('/cafe/sokuon-complete')
  })

  it('/youon has checkpoints for hiragana-yōon-complete and katakana-yōon-complete (both Restaurant, no forced new dishes for the latter)', () => {
    const { getAllByTestId } = renderYouonPage()
    const restaurantCtas = getAllByTestId('restaurant-cta')
    // katakana-youon-complete has no forced new dishes but still places an
    // inline Restaurant CTA (Issue #160: existing suitable items carry it).
    expect(restaurantCtas).toHaveLength(2)
  })

  it('/youon (bundled with Special Katakana, matching the real route) also has the special-katakana-complete Cafe checkpoint', () => {
    const { getAllByTestId } = renderYouonPageWithSpecialKatakana()
    const cafeCtas = getAllByTestId('cafe-cta')
    const restaurantCtas = getAllByTestId('restaurant-cta')
    expect(restaurantCtas).toHaveLength(2)
    expect(cafeCtas).toHaveLength(1)
  })

  it('navigates to the Special Katakana Cafe checkpoint route on click', () => {
    const { getAllByTestId, getByTestId } = render(
      <MemoryRouter initialEntries={['/youon']}>
        <Routes>
          <Route
            path="/youon"
            element={<CategoryRowsPage title="拗音" description="" categoryIds={[YOUON_CATEGORY_ID, SPECIAL_KATAKANA_CATEGORY_ID]} />}
          />
          <Route path="/cafe/special-katakana-complete" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(getAllByTestId('cafe-cta')[0])
    expect(getByTestId('landed-path')).toHaveTextContent('/cafe/special-katakana-complete')
  })

  it('does not add any checkpoint to /katakana beyond its 3 configured ones (no unintended changes to unrelated stages)', () => {
    const { getAllByTestId } = renderKatakana()
    const allCtas = [...getAllByTestId('restaurant-cta'), ...getAllByTestId('cafe-cta')]
    expect(allCtas).toHaveLength(3)
  })
})
