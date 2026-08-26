import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YOUON_GUIDE_STEPS } from '../data/youonGuide'
import { DEFAULT_YOUON_GUIDE_LOCALE, YOUON_GUIDE_CONTENT } from '../data/youonGuideContent'
import { PracticeHubPage } from '../routes/PracticeHubPage'
import { useProgressStore } from '../store/progressStore'

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))

vi.mock('../hooks/useTTS', () => ({ useTTS: () => tts }))

const locale = YOUON_GUIDE_CONTENT[DEFAULT_YOUON_GUIDE_LOCALE]

function renderHub(categoryId = 'youon', rowId = 'youon-ka-row') {
  return render(
    <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}`]}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  // Introduction always precedes concept guides in the real App. This makes
  // each test fresh specifically for the independent Yōon Guide state.
  useProgressStore.getState().setHasCompletedIntroGuide(true)
  tts.speak.mockReset()
  tts.stop.mockReset()
})

// Content — step order, narration/subtitle wording, exact audio keys.
describe('Yōon Guide content (Issue #50)', () => {
  it('has the exact step order: Intro -> 1 -> 2 -> 3 -> 4 -> Katakana', () => {
    expect(YOUON_GUIDE_STEPS).toEqual(['youon.intro', 'youon.one', 'youon.two', 'youon.three', 'youon.four', 'youon.katakana'])
  })

  it('numbered steps 1-4 literally start with One./Two./Three./Four. in both subtitle and narration text', () => {
    expect(locale.steps['youon.one'].subtitle).toMatch(/^One\./)
    expect(locale.steps['youon.two'].subtitle).toMatch(/^Two\./)
    expect(locale.steps['youon.three'].subtitle).toMatch(/^Three\./)
    expect(locale.steps['youon.four'].subtitle).toMatch(/^Four\./)
  })

  it('Intro and Katakana steps carry no step number', () => {
    expect(locale.steps['youon.intro'].subtitle).not.toMatch(/^(One|Two|Three|Four)\./)
    expect(locale.steps['youon.katakana'].subtitle).not.toMatch(/^(One|Two|Three|Four)\./)
  })

  it('has no fifth numbered step or Katakana step number anywhere in the content', () => {
    for (const step of YOUON_GUIDE_STEPS) {
      expect(locale.steps[step].subtitle).not.toMatch(/\bFive\b|\b5\b|⑤/)
    }
  })

  it('embeds real Unicode kana, never romanized substitutes, in every step that names specific kana', () => {
    const kana = /[぀-ゟ゠-ヿ]/
    // Only the Intro step is pure scene-setting with no specific kana named
    // (see the spec's narration table) — every other step calls out actual
    // characters (き, ゃ, きゃ, ...) that must be real Unicode kana, not
    // romanized.
    for (const step of YOUON_GUIDE_STEPS.filter((s) => s !== 'youon.intro')) {
      expect(locale.steps[step].subtitle).toMatch(kana)
    }
  })

  it('has a distinct, non-empty audio key per step', () => {
    const keys = YOUON_GUIDE_STEPS.map((step) => locale.steps[step].audioKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key.length).toBeGreaterThan(0)
  })
})

describe('Yōon Guide initial display (Issue #50)', () => {
  it('shows once on the first Yōon hub (youon-ka-row) with the shared slide and the Intro step', () => {
    const hub = renderHub()

    expect(hub.getByTestId('youon-guide')).toHaveAttribute('role', 'dialog')
    expect(hub.getByRole('img', { name: 'Tamamizu explains small ya, yu, yo' })).toHaveAttribute(
      'src',
      '/guide/slide-youon.webp',
    )
    expect(hub.getByText(locale.steps['youon.intro'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenCalledWith(
      locale.steps['youon.intro'].audioKey,
      locale.steps['youon.intro'].subtitle,
      locale.lang,
    )
  })

  it('does not show on a different Yōon row or a different category', () => {
    expect(renderHub('youon', 'youon-sha-row').queryByTestId('youon-guide')).toBeNull()
    expect(renderHub('hiragana', 'a-row').queryByTestId('youon-guide')).toBeNull()
  })

  it('never appears before the Introduction Guide has been completed', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(false)
    expect(renderHub().queryByTestId('youon-guide')).toBeNull()
  })

  it('does not show again after dismissal', () => {
    const first = renderHub()
    fireEvent.click(first.getByText(locale.skipLabel))
    first.unmount()

    expect(renderHub().queryByTestId('youon-guide')).toBeNull()
  })
})

describe('Yōon Guide navigation (Issue #50)', () => {
  it('advances Intro -> 1 -> 2 -> 3 -> 4 -> Katakana via Next, stopping audio on every step change', () => {
    const hub = renderHub()

    for (let i = 1; i < YOUON_GUIDE_STEPS.length; i++) {
      tts.stop.mockClear()
      fireEvent.click(hub.getByText(locale.nextLabel))
      expect(tts.stop).toHaveBeenCalled()
      const stepId = YOUON_GUIDE_STEPS[i]
      expect(hub.getByText(locale.steps[stepId].subtitle)).toBeInTheDocument()
      expect(tts.speak).toHaveBeenLastCalledWith(locale.steps[stepId].audioKey, locale.steps[stepId].subtitle, locale.lang)
    }

    // On the final (Katakana) step, the button reads the final/"Got it!" label.
    expect(hub.getByText(locale.finalLabel)).toBeInTheDocument()
  })

  it('Next is usable immediately, even while step audio would still be "playing" (no gating)', () => {
    const hub = renderHub()
    fireEvent.click(hub.getByText(locale.nextLabel))
    expect(hub.getByText(locale.steps['youon.one'].subtitle)).toBeInTheDocument()
  })

  it('dismissing from the final Got it! button marks the Guide completed and closes it', () => {
    const hub = renderHub()
    for (let i = 1; i < YOUON_GUIDE_STEPS.length; i++) fireEvent.click(hub.getByText(locale.nextLabel))

    fireEvent.click(hub.getByText(locale.finalLabel))

    expect(hub.queryByTestId('youon-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedYouonGuide).toBe(true)
  })

  it('Skip is available from any step and dismisses immediately', () => {
    const hub = renderHub()
    fireEvent.click(hub.getByText(locale.nextLabel))
    fireEvent.click(hub.getByText(locale.nextLabel))

    fireEvent.click(hub.getByText(locale.skipLabel))

    expect(hub.queryByTestId('youon-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedYouonGuide).toBe(true)
  })

  it('stops narration when the guide unmounts', () => {
    const hub = renderHub()
    hub.unmount()
    expect(tts.stop).toHaveBeenCalled()
  })
})

describe('Yōon Guide state independence (Issue #50)', () => {
  it('dismissal disables hub activities until dismissed, then restores links without changing learning progress or other Guide flags', () => {
    const hub = renderHub()
    const before = useProgressStore.getState()
    const progressBefore = {
      taughtRowIds: before.taughtRowIds,
      rowActivityCompletion: before.rowActivityCompletion,
      characters: before.characters,
      words: before.words,
      unlockedRowIds: before.unlockedRowIds,
      lastStudied: before.lastStudied,
    }

    const activityCards = () => hub.getAllByRole('link').filter((card) => card.classList.contains('rounded-xl'))
    expect(activityCards().length).toBeGreaterThan(0)
    for (const card of activityCards()) {
      expect(card).toHaveAttribute('aria-disabled', 'true')
    }

    fireEvent.click(hub.getByText(locale.skipLabel))

    const after = useProgressStore.getState()
    expect(after.hasCompletedYouonGuide).toBe(true)
    expect(after.hasCompletedIntroGuide).toBe(true)
    expect(after.hasCompletedSokuonGuide).toBe(false)
    expect(after.hasCompletedLearnTracingGuide).toBe(false)
    expect(after.hasCompletedPracticeGuide).toBe(false)
    expect(after.hasCompletedReviewGuide).toBe(false)
    expect({
      taughtRowIds: after.taughtRowIds,
      rowActivityCompletion: after.rowActivityCompletion,
      characters: after.characters,
      words: after.words,
      unlockedRowIds: after.unlockedRowIds,
      lastStudied: after.lastStudied,
    }).toEqual(progressBefore)

    for (const card of activityCards()) {
      expect(card).not.toHaveAttribute('aria-disabled')
    }
  })
})

describe('Yōon Guide replay (Issue #50)', () => {
  function renderHubWithReplay() {
    return render(
      <MemoryRouter initialEntries={['/practice/youon/youon-ka-row?guide=youon']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('replays even when already completed, and never writes hasCompletedYouonGuide on dismiss', () => {
    useProgressStore.getState().setHasCompletedYouonGuide(true)
    const hub = renderHubWithReplay()

    expect(hub.getByTestId('youon-guide')).toBeInTheDocument()

    fireEvent.click(hub.getByText(locale.skipLabel))

    expect(hub.queryByTestId('youon-guide')).toBeNull()
    // Still true from the pre-set value above — the replay's dismiss clears
    // the ephemeral `?guide=` target instead of touching the flag.
    expect(useProgressStore.getState().hasCompletedYouonGuide).toBe(true)
  })

  it('an unrelated or invalid ?guide= id does not force-show the Yōon Guide once it is already completed', () => {
    useProgressStore.getState().setHasCompletedYouonGuide(true)
    const hub = render(
      <MemoryRouter initialEntries={['/practice/youon/youon-ka-row?guide=not-a-real-guide']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(hub.queryByTestId('youon-guide')).toBeNull()
  })
})
