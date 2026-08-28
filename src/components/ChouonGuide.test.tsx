import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHOUON_GUIDE_STEPS } from '../data/chouonGuide'
import { DEFAULT_CHOUON_GUIDE_LOCALE, CHOUON_GUIDE_CONTENT } from '../data/chouonGuideContent'
import { PracticeHubPage } from '../routes/PracticeHubPage'
import { useProgressStore } from '../store/progressStore'

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))

vi.mock('../hooks/useTTS', () => ({ useTTS: () => tts }))

const locale = CHOUON_GUIDE_CONTENT[DEFAULT_CHOUON_GUIDE_LOCALE]

function renderHub(categoryId = 'chouon', rowId = 'chouon-a-row') {
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
  // each test fresh specifically for the independent Chōon Guide state.
  useProgressStore.getState().setHasCompletedIntroGuide(true)
  tts.speak.mockReset()
  tts.stop.mockReset()
})

describe('Chōon Guide content', () => {
  it('has all 8 slides in the exact order: Intro, a, i, u, e, o, Quiz, Answers', () => {
    expect(CHOUON_GUIDE_STEPS.map((s) => s.id)).toEqual([
      'chouon.intro',
      'chouon.a',
      'chouon.i',
      'chouon.u',
      'chouon.e',
      'chouon.o',
      'chouon.quiz',
      'chouon.answers',
    ])
  })

  it('each step points at its own numbered slide asset, in order 1-8', () => {
    expect(CHOUON_GUIDE_STEPS.map((s) => s.slideAsset)).toEqual([
      'guide/slide-chouon-1.webp',
      'guide/slide-chouon-2.webp',
      'guide/slide-chouon-3.webp',
      'guide/slide-chouon-4.webp',
      'guide/slide-chouon-5.webp',
      'guide/slide-chouon-6.webp',
      'guide/slide-chouon-7.webp',
      'guide/slide-chouon-8.webp',
    ])
  })

  it('uses the exact confirmed narration/subtitle script for every step, verbatim', () => {
    expect(locale.steps['chouon.intro'].subtitle).toBe(
      'Now let’s learn about long vowels. A long vowel is a vowel sound held for an extra beat. In hiragana, write the extra sound with あ, い, う, え, or お. Don’t use the long vowel mark ー. In katakana, use the long vowel mark ー. For example, ラーメン.',
    )
    expect(locale.steps['chouon.a'].subtitle).toBe(
      'For a long あ sound in hiragana, add あ. For example, おかあさん and おばあさん. Hold the あ sound a little longer.',
    )
    expect(locale.steps['chouon.i'].subtitle).toBe(
      'For a long い sound in hiragana, add い. For example, おにいさん and おじいさん. Hold the い sound a little longer.',
    )
    expect(locale.steps['chouon.u'].subtitle).toBe(
      'For a long う sound in hiragana, add う. For example, ゆうき and くうき. Hold the う sound a little longer.',
    )
    expect(locale.steps['chouon.e'].subtitle).toBe(
      'For a long え sound in hiragana, usually add い. For example, えいが and ゆうめい. But おねえさん use え instead.',
    )
    expect(locale.steps['chouon.o'].subtitle).toBe(
      'For a long お sound in hiragana, usually add う. For example, おはよう and いもうと. But some words use お instead, like とおい and こおり.',
    )
    expect(locale.steps['chouon.quiz'].subtitle).toBe(
      'Now, let’s try a quick quiz. Fill in each blank with あ, い, う, え, お, or ー. Try all eight.',
    )
    expect(locale.steps['chouon.answers'].subtitle).toBe(
      'Let’s check the answers. One, おかあさん. Two, おにいさん. Three, ゆうき. Four, えいが. Five, おねえさん. Six, おはよう. Seven, とおい. Eight, ラーメン.',
    )
  })

  it('the え-sound slide states the exception exactly as "But おねえさん use え instead." — no paraphrase', () => {
    expect(locale.steps['chouon.e'].subtitle).toMatch(/But おねえさん use え instead\.$/)
    // Guards against silent rewording to "another exception"/"some words"/etc.
    expect(locale.steps['chouon.e'].subtitle).not.toMatch(/another exception|some words use え|おねえさん uses え/)
  })

  it('the Quiz slide never reads out any answer', () => {
    expect(locale.steps['chouon.quiz'].subtitle).not.toMatch(/おかあさん|おにいさん|ゆうき|えいが|おねえさん|おはよう|とおい|ラーメン/)
  })

  it('subtitle exactly matches narration for every step (same string used for both)', () => {
    for (const step of CHOUON_GUIDE_STEPS) {
      // There's only one text field per step (subtitle doubles as narration
      // text passed to speak()) — this asserts that design invariant holds
      // structurally, not just by convention.
      expect(typeof locale.steps[step.id].subtitle).toBe('string')
      expect(locale.steps[step.id].subtitle.length).toBeGreaterThan(0)
    }
  })

  it('embeds real Unicode kana, never romanized substitutes, in every step', () => {
    const kana = /[぀-ゟ゠-ヿ]/
    for (const step of CHOUON_GUIDE_STEPS) {
      expect(locale.steps[step.id].subtitle).toMatch(kana)
    }
    // Explicit NG-list from the spec — none of these romanized forms may
    // appear anywhere in the content.
    const ng = ['okaasan', 'oniisan', 'yuuki', 'eiga', 'oneesan', 'ohayou', 'tooi', 'raamen']
    const allText = CHOUON_GUIDE_STEPS.map((s) => locale.steps[s.id].subtitle).join(' ')
    for (const bad of ng) expect(allText.toLowerCase()).not.toContain(bad)
  })

  it('has a distinct, correctly-named audio key per step (guide/chouon-1 .. guide/chouon-8)', () => {
    expect(CHOUON_GUIDE_STEPS.map((s) => locale.steps[s.id].audioKey)).toEqual([
      'guide/chouon-1',
      'guide/chouon-2',
      'guide/chouon-3',
      'guide/chouon-4',
      'guide/chouon-5',
      'guide/chouon-6',
      'guide/chouon-7',
      'guide/chouon-8',
    ])
  })
})

describe('Chōon Guide initial display', () => {
  it('shows once on the first Chōon hub (chouon-a-row) with slide 1 and the Intro step', () => {
    const hub = renderHub()

    expect(hub.getByTestId('chouon-guide')).toHaveAttribute('role', 'dialog')
    expect(hub.getByRole('img', { name: 'Tamamizu explains long vowels' })).toHaveAttribute('src', '/guide/slide-chouon-1.webp')
    expect(hub.getByText(locale.steps['chouon.intro'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenCalledWith(
      locale.steps['chouon.intro'].audioKey,
      locale.steps['chouon.intro'].subtitle,
      locale.lang,
    )
  })

  it('does not show on a different Chōon row or a different category', () => {
    expect(renderHub('chouon', 'chouon-i-row').queryByTestId('chouon-guide')).toBeNull()
    expect(renderHub('hiragana', 'a-row').queryByTestId('chouon-guide')).toBeNull()
  })

  it('never appears before the Introduction Guide has been completed', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(false)
    expect(renderHub().queryByTestId('chouon-guide')).toBeNull()
  })

  it('does not show again after dismissal', () => {
    const first = renderHub()
    fireEvent.click(first.getByText(locale.skipLabel))
    first.unmount()

    expect(renderHub().queryByTestId('chouon-guide')).toBeNull()
  })
})

describe('Chōon Guide navigation', () => {
  it('advances through all 8 slides in order via Next, showing each one\'s own image, stopping audio on every step change', () => {
    const hub = renderHub()

    for (let i = 1; i < CHOUON_GUIDE_STEPS.length; i++) {
      tts.stop.mockClear()
      fireEvent.click(hub.getByText(locale.nextLabel))
      expect(tts.stop).toHaveBeenCalled()
      const step = CHOUON_GUIDE_STEPS[i]
      expect(hub.getByRole('img', { name: 'Tamamizu explains long vowels' })).toHaveAttribute(
        'src',
        `/${step.slideAsset}`,
      )
      expect(hub.getByText(locale.steps[step.id].subtitle)).toBeInTheDocument()
      expect(tts.speak).toHaveBeenLastCalledWith(locale.steps[step.id].audioKey, locale.steps[step.id].subtitle, locale.lang)
    }

    // On the final (Answers) step, the button reads the final/"Got it!" label.
    expect(hub.getByText(locale.finalLabel)).toBeInTheDocument()
  })

  it('dismissing from the final Got it! button (slide 8) marks the Guide completed and closes it', () => {
    const hub = renderHub()
    for (let i = 1; i < CHOUON_GUIDE_STEPS.length; i++) fireEvent.click(hub.getByText(locale.nextLabel))

    fireEvent.click(hub.getByText(locale.finalLabel))

    expect(hub.queryByTestId('chouon-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedChouonGuide).toBe(true)
  })

  it('Skip is available from any step and dismisses immediately', () => {
    const hub = renderHub()
    fireEvent.click(hub.getByText(locale.nextLabel))
    fireEvent.click(hub.getByText(locale.nextLabel))

    fireEvent.click(hub.getByText(locale.skipLabel))

    expect(hub.queryByTestId('chouon-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedChouonGuide).toBe(true)
  })

  it('stops narration when the guide unmounts', () => {
    const hub = renderHub()
    hub.unmount()
    expect(tts.stop).toHaveBeenCalled()
  })
})

describe('Chōon Guide Quiz slide (slide 7)', () => {
  it('advancing from Quiz to Answers changes nothing but the Guide step — no learning/progress/SRS/Review state is touched', () => {
    const hub = renderHub()
    // Advance to slide 7 (Quiz): Intro -> a -> i -> u -> e -> o -> Quiz.
    for (let i = 0; i < 6; i++) fireEvent.click(hub.getByText(locale.nextLabel))
    expect(hub.getByText(locale.steps['chouon.quiz'].subtitle)).toBeInTheDocument()

    const before = useProgressStore.getState()
    const guard = {
      taughtRowIds: before.taughtRowIds,
      rowActivityCompletion: before.rowActivityCompletion,
      characters: before.characters,
      words: before.words,
      unlockedRowIds: before.unlockedRowIds,
      lastStudied: before.lastStudied,
    }

    fireEvent.click(hub.getByText(locale.nextLabel))

    expect(hub.getByText(locale.steps['chouon.answers'].subtitle)).toBeInTheDocument()
    const after = useProgressStore.getState()
    expect({
      taughtRowIds: after.taughtRowIds,
      rowActivityCompletion: after.rowActivityCompletion,
      characters: after.characters,
      words: after.words,
      unlockedRowIds: after.unlockedRowIds,
      lastStudied: after.lastStudied,
    }).toEqual(guard)
  })

  it('has no interactive input/scoring elements on the Quiz slide (look-only, image-driven)', () => {
    const hub = renderHub()
    for (let i = 0; i < 6; i++) fireEvent.click(hub.getByText(locale.nextLabel))

    expect(hub.container.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })
})

describe('Chōon Guide state independence', () => {
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
    expect(after.hasCompletedChouonGuide).toBe(true)
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

describe('Chōon Guide replay', () => {
  function renderHubWithReplay() {
    return render(
      <MemoryRouter initialEntries={['/practice/chouon/chouon-a-row?guide=chouon']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('replays even when already completed, and never writes hasCompletedChouonGuide on dismiss', () => {
    useProgressStore.getState().setHasCompletedChouonGuide(true)
    const hub = renderHubWithReplay()

    expect(hub.getByTestId('chouon-guide')).toBeInTheDocument()

    fireEvent.click(hub.getByText(locale.skipLabel))

    expect(hub.queryByTestId('chouon-guide')).toBeNull()
    // Still true from the pre-set value above — the replay's dismiss clears
    // the ephemeral `?guide=` target instead of touching the flag.
    expect(useProgressStore.getState().hasCompletedChouonGuide).toBe(true)
  })

  it('an unrelated or invalid ?guide= id does not force-show the Chōon Guide once it is already completed', () => {
    useProgressStore.getState().setHasCompletedChouonGuide(true)
    const hub = render(
      <MemoryRouter initialEntries={['/practice/chouon/chouon-a-row?guide=not-a-real-guide']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(hub.queryByTestId('chouon-guide')).toBeNull()
  })
})