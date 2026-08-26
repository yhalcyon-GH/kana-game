import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHOUON_CATEGORY_ID, DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID, SOKUON_CATEGORY_ID, YOUON_CATEGORY_ID } from '../data/curriculum'
import { INTRO_GUIDE_CONTENT, DEFAULT_INTRO_GUIDE_LOCALE } from '../data/introGuideContent'
import { KANA_INTRO_EXCERPT_GUIDE_CONTENT, DEFAULT_KANA_INTRO_EXCERPT_GUIDE_LOCALE } from '../data/kanaIntroExcerptGuideContent'
import { useProgressStore } from '../store/progressStore'
import { CategoryRowsPage } from './CategoryRowsPage'

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
  // Search-param changes (the replay target) don't change the matched
  // route, so LocationDisplay is rendered alongside the page directly
  // rather than via a separate wildcard Route.
  return render(
    <MemoryRouter initialEntries={['/section']}>
      <LocationDisplay />
      <CategoryRowsPage title={title} description="" categoryIds={[categoryId]} showKanaIntroExcerptGuide />
    </MemoryRouter>,
  )
}

// Issue #46: the Hiragana and Katakana section pages both get the same
// always-available replay button for the two-step Introduction excerpt
// ("kana represent sounds" -> "Hiragana vs Katakana usage"), reusing PR
// #43's step data/copy/audio verbatim rather than a new standalone Guide.
describe.each([
  ['Hiragana', DEFAULT_CATEGORY_ID],
  ['Katakana', KATAKANA_CATEGORY_ID],
])('%s section Hiragana & Katakana Guide replay button (Issue #46)', (title, categoryId) => {
  it('shows the replay button', () => {
    const { getByText } = renderSection(categoryId, title)
    expect(getByText(excerptLocale.buttonLabel)).toBeInTheDocument()
  })

  it('replays exactly the kana-sounds then kana-usage Introduction steps, in order, and no other step', () => {
    const { getByText, queryByText, getByTestId } = renderSection(categoryId, title)

    fireEvent.click(getByText(excerptLocale.buttonLabel))

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
    const { getByText, queryByTestId } = renderSection(categoryId, title)

    fireEvent.click(getByText(excerptLocale.buttonLabel))
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

    fireEvent.click(getByText(excerptLocale.buttonLabel))
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
    const { getByText, unmount } = renderSection(categoryId, title)

    fireEvent.click(getByText(excerptLocale.buttonLabel))
    tts.stop.mockClear()
    unmount()

    expect(tts.stop).toHaveBeenCalled()
  })

  it('dismissing removes the replay target and restores the normal section, reload-safe', () => {
    const { getByText, queryByTestId, getByTestId } = renderSection(categoryId, title)

    fireEvent.click(getByText(excerptLocale.buttonLabel))
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

// Issue #46: the always-visible Sokuon category explanation is replaced by
// an always-available "View Sokuon Guide" button that opens the existing
// Sokuon concept Guide on its real screen — Chōon keeps its own unrelated
// category explanation unchanged.
describe('Sokuon section Guide replay (Issue #46)', () => {
  it('no longer shows the old always-visible Sokuon explanation', () => {
    const { queryByText } = renderOtherPage()
    expect(queryByText(/Sokuon is a short pause/)).toBeNull()
  })

  it("keeps Chōon's own category explanation unchanged", () => {
    const { getByText } = renderOtherPage()
    expect(getByText(/Chōon means a "long vowel"/)).toBeInTheDocument()
  })

  it('always shows the View Sokuon Guide button', () => {
    useProgressStore.getState().setHasCompletedSokuonGuide(true)
    const { getByText } = renderOtherPage()
    expect(getByText('View Sokuon Guide')).toBeInTheDocument()
  })

  it('opens the Sokuon Guide replay target on its real screen without changing hasCompletedSokuonGuide', () => {
    useProgressStore.getState().setHasCompletedSokuonGuide(true)
    const { getByText, getByTestId } = renderOtherPage()

    fireEvent.click(getByText('View Sokuon Guide'))

    expect(getByTestId('landed-path')).toHaveTextContent('/practice/sokuon/sokuon-row?guide=sokuon')
    expect(useProgressStore.getState().hasCompletedSokuonGuide).toBe(true)
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

// Issue #50: the always-visible Yōon category explanation duplicates the new
// Yōon Guide's content, so it's replaced by an always-available "View Yōon
// Guide" button, matching Sokuon's Issue #46 precedent.
describe('Yōon section Guide replay (Issue #50)', () => {
  it('no longer shows the old always-visible Yōon explanation', () => {
    const { queryByText } = renderYouonPage()
    expect(queryByText(/Yōon are contracted sounds/)).toBeNull()
  })

  it('always shows the View Yōon Guide button', () => {
    useProgressStore.getState().setHasCompletedYouonGuide(true)
    const { getByText } = renderYouonPage()
    expect(getByText('View Yōon Guide')).toBeInTheDocument()
  })

  it('opens the Yōon Guide replay target on its real screen without changing hasCompletedYouonGuide', () => {
    useProgressStore.getState().setHasCompletedYouonGuide(true)
    const { getByText, getByTestId } = renderYouonPage()

    fireEvent.click(getByText('View Yōon Guide'))

    expect(getByTestId('landed-path')).toHaveTextContent('/practice/youon/youon-ka-row?guide=youon')
    expect(useProgressStore.getState().hasCompletedYouonGuide).toBe(true)
  })
})
