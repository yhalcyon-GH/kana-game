import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SPECIAL_KATAKANA_GUIDE_STEPS } from '../data/specialKatakanaGuide'
import { DEFAULT_SPECIAL_KATAKANA_GUIDE_LOCALE, SPECIAL_KATAKANA_GUIDE_CONTENT } from '../data/specialKatakanaGuideContent'
import { CategoryRowsPage } from '../routes/CategoryRowsPage'
import { PracticeHubPage } from '../routes/PracticeHubPage'
import { useProgressStore } from '../store/progressStore'

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))

vi.mock('../hooks/useTTS', () => ({ useTTS: () => tts }))

const locale = SPECIAL_KATAKANA_GUIDE_CONTENT[DEFAULT_SPECIAL_KATAKANA_GUIDE_LOCALE]

function renderHub(categoryId = 'special-katakana', rowId = 'special-katakana-fa-row') {
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
  useProgressStore.getState().setHasCompletedIntroGuide(true)
  tts.speak.mockReset()
  tts.stop.mockReset()
})

describe('Special Katakana Guide content', () => {
  it('has exactly 3 steps: intro -> how -> common', () => {
    expect(SPECIAL_KATAKANA_GUIDE_STEPS).toEqual(['specialKatakana.intro', 'specialKatakana.how', 'specialKatakana.common'])
  })

  it('uses the exact confirmed scripts, verbatim', () => {
    expect(locale.steps['specialKatakana.intro'].subtitle).toBe(
      'Japanese borrowed many words with sounds it didn’t originally have. Special Katakana is used to write those sounds. That’s why these sounds are only used in Katakana.',
    )
    expect(locale.steps['specialKatakana.how'].subtitle).toBe(
      'Just like small ya, yu, and yo, a small kana can combine with the kana before it to make one sound. Here, we use small vowel kana.',
    )
    expect(locale.steps['specialKatakana.common'].subtitle).toBe(
      'There are many Special Katakana sounds. Here, we’ll learn some of the most common ones.',
    )
  })

  it('never uses the term "yōon" in narration — says "small ya, yu, and yo" instead', () => {
    for (const step of SPECIAL_KATAKANA_GUIDE_STEPS) {
      expect(locale.steps[step].subtitle.toLowerCase()).not.toContain('yōon')
      expect(locale.steps[step].subtitle.toLowerCase()).not.toContain('youon')
    }
    expect(locale.steps['specialKatakana.how'].subtitle).toContain('small ya, yu, and yo')
  })

  it('has a distinct, non-empty audio key per step', () => {
    const keys = SPECIAL_KATAKANA_GUIDE_STEPS.map((step) => locale.steps[step].audioKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key.length).toBeGreaterThan(0)
  })
})

describe('Special Katakana Guide initial display', () => {
  it('shows on the first Special Katakana session (special-katakana-fa-row) with the shared slide and the intro step', () => {
    const hub = renderHub()

    expect(hub.getByTestId('special-katakana-guide')).toHaveAttribute('role', 'dialog')
    expect(hub.getByRole('img', { name: 'Tamamizu explains Special Katakana' })).toHaveAttribute(
      'src',
      '/guide/slide-special-katakana.webp',
    )
    expect(hub.getByText(locale.steps['specialKatakana.intro'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenCalledWith(
      locale.steps['specialKatakana.intro'].audioKey,
      locale.steps['specialKatakana.intro'].subtitle,
      locale.lang,
    )
  })

  it('does NOT show on the second Special Katakana session, or a different category', () => {
    expect(renderHub('special-katakana', 'special-katakana-she-row').queryByTestId('special-katakana-guide')).toBeNull()
    expect(renderHub('hiragana', 'a-row').queryByTestId('special-katakana-guide')).toBeNull()
  })

  it('never appears before the Introduction Guide has been completed', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(false)
    expect(renderHub().queryByTestId('special-katakana-guide')).toBeNull()
  })

  // The Special Katakana Guide must NOT auto-trigger just from visiting the
  // shared /youon page (unlike Sokuon/Chōon/Yōon's page-level auto-Guides)
  // — only from entering Special Katakana's first session specifically.
  it('does not show merely from visiting the shared /youon page (no premature trigger)', () => {
    const page = render(
      <MemoryRouter initialEntries={['/youon']}>
        <Routes>
          <Route path="/youon" element={<CategoryRowsPage title="ゃゅょ" description="" categoryIds={['youon', 'special-katakana']} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(page.queryByTestId('special-katakana-guide')).toBeNull()
  })

  it('does not show again after dismissal', () => {
    const first = renderHub()
    fireEvent.click(first.getByText(locale.skipLabel))
    first.unmount()

    expect(renderHub().queryByTestId('special-katakana-guide')).toBeNull()
  })
})

describe('Special Katakana Guide navigation', () => {
  it('advances intro -> how -> common via Next, stopping audio on every step change', () => {
    const hub = renderHub()

    for (let i = 1; i < SPECIAL_KATAKANA_GUIDE_STEPS.length; i++) {
      tts.stop.mockClear()
      fireEvent.click(hub.getByText(locale.nextLabel))
      expect(tts.stop).toHaveBeenCalled()
      const stepId = SPECIAL_KATAKANA_GUIDE_STEPS[i]
      expect(hub.getByText(locale.steps[stepId].subtitle)).toBeInTheDocument()
      expect(tts.speak).toHaveBeenLastCalledWith(locale.steps[stepId].audioKey, locale.steps[stepId].subtitle, locale.lang)
    }

    expect(hub.getByText(locale.finalLabel)).toBeInTheDocument()
  })

  it('Next is usable immediately, even while step audio would still be "playing" (no gating)', () => {
    const hub = renderHub()
    fireEvent.click(hub.getByText(locale.nextLabel))
    expect(hub.getByText(locale.steps['specialKatakana.how'].subtitle)).toBeInTheDocument()
  })

  it('dismissing from the final Got it! button marks the Guide completed and closes it', () => {
    const hub = renderHub()
    for (let i = 1; i < SPECIAL_KATAKANA_GUIDE_STEPS.length; i++) fireEvent.click(hub.getByText(locale.nextLabel))

    fireEvent.click(hub.getByText(locale.finalLabel))

    expect(hub.queryByTestId('special-katakana-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedSpecialKatakanaGuide).toBe(true)
  })

  it('Skip is available from any step and dismisses immediately', () => {
    const hub = renderHub()
    fireEvent.click(hub.getByText(locale.nextLabel))

    fireEvent.click(hub.getByText(locale.skipLabel))

    expect(hub.queryByTestId('special-katakana-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedSpecialKatakanaGuide).toBe(true)
  })

  it('stops narration when the guide unmounts', () => {
    const hub = renderHub()
    hub.unmount()
    expect(tts.stop).toHaveBeenCalled()
  })
})

describe('Special Katakana Guide Back navigation', () => {
  it('advancing then Back returns one step, and replays that step\'s narration', () => {
    const hub = renderHub()
    fireEvent.click(hub.getByText(locale.nextLabel))
    expect(hub.getByText(locale.steps['specialKatakana.how'].subtitle)).toBeInTheDocument()

    tts.speak.mockClear()
    fireEvent.click(hub.getByText('Back'))
    expect(hub.getByText(locale.steps['specialKatakana.intro'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenCalledWith(
      locale.steps['specialKatakana.intro'].audioKey,
      locale.steps['specialKatakana.intro'].subtitle,
      locale.lang,
    )
  })

  it('Back is disabled on the first step', () => {
    const hub = renderHub()
    expect(hub.getByText('Back')).toBeDisabled()
  })

  it('Back does not mark the Special Katakana Guide completed', () => {
    const hub = renderHub()
    fireEvent.click(hub.getByText(locale.nextLabel))
    fireEvent.click(hub.getByText('Back'))
    expect(useProgressStore.getState().hasCompletedSpecialKatakanaGuide).toBe(false)
  })
})

describe('Special Katakana Guide replay', () => {
  function renderHubWithReplay() {
    return render(
      <MemoryRouter initialEntries={['/practice/special-katakana/special-katakana-fa-row?guide=specialKatakana']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('replays even when already completed, and never writes hasCompletedSpecialKatakanaGuide, progress, mastery, taught, Review, or Recommended Path state on dismiss', () => {
    useProgressStore.getState().setHasCompletedSpecialKatakanaGuide(true)
    const hub = renderHubWithReplay()

    expect(hub.getByTestId('special-katakana-guide')).toBeInTheDocument()

    const before = useProgressStore.getState()
    const snapshot = {
      taughtRowIds: before.taughtRowIds,
      rowActivityCompletion: before.rowActivityCompletion,
      characters: before.characters,
      words: before.words,
      unlockedRowIds: before.unlockedRowIds,
    }

    fireEvent.click(hub.getByText(locale.skipLabel))

    expect(hub.queryByTestId('special-katakana-guide')).toBeNull()
    // Still true from the pre-set value above — the replay's dismiss clears
    // the ephemeral `?guide=` target instead of touching the flag.
    expect(useProgressStore.getState().hasCompletedSpecialKatakanaGuide).toBe(true)
    const after = useProgressStore.getState()
    expect({
      taughtRowIds: after.taughtRowIds,
      rowActivityCompletion: after.rowActivityCompletion,
      characters: after.characters,
      words: after.words,
      unlockedRowIds: after.unlockedRowIds,
    }).toEqual(snapshot)
  })

  it('an unrelated or invalid ?guide= id does not force-show the Special Katakana Guide once it is already completed', () => {
    useProgressStore.getState().setHasCompletedSpecialKatakanaGuide(true)
    const hub = render(
      <MemoryRouter initialEntries={['/practice/special-katakana/special-katakana-fa-row?guide=not-a-real-guide']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(hub.queryByTestId('special-katakana-guide')).toBeNull()
  })
})
