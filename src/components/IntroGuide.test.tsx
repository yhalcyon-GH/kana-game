import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INTRO_GUIDE_STEPS } from '../data/introGuide'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from '../data/introGuideContent'
import { useProgressStore } from '../store/progressStore'
import { IntroGuide } from './IntroGuide'

const locale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]

const mockSpeakStaticOnly = vi.fn().mockResolvedValue(true)
const mockStop = vi.fn()
vi.mock('../hooks/useTTS', () => ({
  useTTS: () => ({ speakStaticOnly: mockSpeakStaticOnly, stop: mockStop, speak: vi.fn(), supported: true }),
}))

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  mockSpeakStaticOnly.mockClear()
  mockStop.mockClear()
})

describe('IntroGuide replay narration (startedStepRef reset across viewing sessions)', () => {
  it('replays step 1 narration on a fresh viewing session after a prior completed session, without double-playing on a plain Next click', () => {
    const speakStaticOnly = mockSpeakStaticOnly

    const callsFor = (audioKey: string) => speakStaticOnly.mock.calls.filter((c) => c[0] === audioKey).length

    // A: first mount plays step 1 (intro.welcome) narration once.
    const { getByText, rerender } = render(<IntroGuide />)
    const welcomeAudioKey = locale.steps['intro.welcome'].audioKey
    expect(callsFor(welcomeAudioKey)).toBe(1)

    // E: Next advances to step 2 and plays its audio exactly once (no
    // double-play from both the click handler and the step-change effect).
    const writingSystemsAudioKey = locale.steps['intro.writingSystems'].audioKey
    fireEvent.click(getByText(locale.nextLabel))
    expect(callsFor(writingSystemsAudioKey)).toBe(1)

    // B: Skip completes the guide.
    fireEvent.click(getByText(locale.skipLabel))
    expect(useProgressStore.getState().hasCompletedIntroGuide).toBe(true)

    // C: "View introduction again" from Settings flips completed back to
    // false on the same mounted instance.
    useProgressStore.getState().setHasCompletedIntroGuide(false)
    rerender(<IntroGuide />)

    // D: step 1's audio plays again on replay — total calls for that
    // audioKey across the initial mount + replay is 2 — and the STALE
    // step 2 audio (from the pre-reset stepIndex, which was still 1/step 2
    // at the moment `completed` flipped to false) must NOT have fired
    // again during the reset: it stays at exactly 1 call total.
    expect(getByText(locale.steps['intro.welcome'].subtitle)).toBeInTheDocument()
    expect(callsFor(welcomeAudioKey)).toBe(2)
    expect(callsFor(writingSystemsAudioKey)).toBe(1)

    // F: clicking Next again in this new session advances to step 2 and
    // plays its audio exactly once more (2 total) — confirming no
    // double-play crept in on the new session either.
    fireEvent.click(getByText(locale.nextLabel))
    expect(callsFor(writingSystemsAudioKey)).toBe(2)
  })
})

describe('IntroGuide (Issue #29/#31)', () => {
  it('renders nothing once the guide is already completed', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    const { container } = render(<IntroGuide />)
    expect(container).toBeEmptyDOMElement()
  })

  it('starts on step 1 (Welcome) with its subtitle and exactly one slide image (Tamamizu is drawn into the art)', () => {
    const { container, getByText } = render(<IntroGuide />)
    expect(getByText(locale.steps['intro.welcome'].subtitle)).toBeInTheDocument()
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('every step shows exactly one slide image, never a separate mascot image', () => {
    const { container, getByText } = render(<IntroGuide />)
    for (let i = 0; i < INTRO_GUIDE_STEPS.length - 1; i++) {
      expect(container.querySelectorAll('img')).toHaveLength(1)
      fireEvent.click(getByText(locale.nextLabel))
    }
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('shows the kana-usage slide and exact locale subtitle as step 4', () => {
    const { container, getByText } = render(<IntroGuide />)
    for (let i = 0; i < 3; i++) fireEvent.click(getByText(locale.nextLabel))

    expect(getByText(locale.steps['intro.kanaUsage'].subtitle)).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('guide/slide-kana-usage.webp'),
    )
  })

  it('Next advances through every step in order, ending on "Let\'s go!"', () => {
    const { getByText } = render(<IntroGuide />)
    const subtitleText = () => document.querySelector('p')?.textContent
    for (let i = 0; i < INTRO_GUIDE_STEPS.length - 1; i++) {
      const step = INTRO_GUIDE_STEPS[i]
      expect(subtitleText()).toBe(locale.steps[step.id].subtitle)
      fireEvent.click(getByText(locale.nextLabel))
    }
    const lastStep = INTRO_GUIDE_STEPS[INTRO_GUIDE_STEPS.length - 1]
    expect(subtitleText()).toBe(locale.steps[lastStep.id].subtitle)
    expect(getByText(locale.finalLabel)).toBeInTheDocument()
  })

  it('clicking the final button ("Let\'s go!") marks the guide completed', () => {
    const { getByText } = render(<IntroGuide />)
    for (let i = 0; i < INTRO_GUIDE_STEPS.length - 1; i++) {
      fireEvent.click(getByText(locale.nextLabel))
    }
    fireEvent.click(getByText(locale.finalLabel))
    expect(useProgressStore.getState().hasCompletedIntroGuide).toBe(true)
  })

  it('Skip is available from the first step and immediately marks the guide completed', () => {
    const { getByText } = render(<IntroGuide />)
    fireEvent.click(getByText(locale.skipLabel))
    expect(useProgressStore.getState().hasCompletedIntroGuide).toBe(true)
  })

  it('re-rendering after Settings resets completion to false starts back at step 1', () => {
    const { getByText, rerender } = render(<IntroGuide />)
    fireEvent.click(getByText(locale.nextLabel)) // now on step 2
    expect(getByText(locale.steps['intro.writingSystems'].subtitle)).toBeInTheDocument()
    fireEvent.click(getByText(locale.skipLabel))
    expect(useProgressStore.getState().hasCompletedIntroGuide).toBe(true)

    useProgressStore.getState().setHasCompletedIntroGuide(false)
    rerender(<IntroGuide />)
    expect(getByText(locale.steps['intro.welcome'].subtitle)).toBeInTheDocument()
  })

  it('final subtitle has no blank line (single \\n, not \\n\\n)', () => {
    const lastStep = INTRO_GUIDE_STEPS[INTRO_GUIDE_STEPS.length - 1]
    expect(locale.steps[lastStep.id].subtitle).not.toContain('\n\n')
  })

  it('never falls back to Web Speech when static playback fails (jsdom audio.play() always rejects) — no synthesis is attempted, and Next still advances', () => {
    // jsdom's HTMLMediaElement.play() always rejects ("not implemented"),
    // so static playback fails on every step here — if IntroGuide still had
    // a Web Speech fallback, this would trigger window.speechSynthesis.speak.
    const synthSpeakSpy = 'speechSynthesis' in window ? vi.spyOn(window.speechSynthesis, 'speak') : null
    const { getByText } = render(<IntroGuide />)
    fireEvent.click(getByText(locale.nextLabel))
    expect(getByText(locale.steps[INTRO_GUIDE_STEPS[1].id].subtitle)).toBeInTheDocument()
    if (synthSpeakSpy) expect(synthSpeakSpy).not.toHaveBeenCalled()
  })

  it('does not touch unlock/taught/completion/Review/SRS/mastery state', () => {
    const { getByText } = render(<IntroGuide />)
    fireEvent.click(getByText(locale.skipLabel))
    const state = useProgressStore.getState()
    expect(state.taughtRowIds).toEqual([])
    expect(state.rowActivityCompletion).toEqual({})
    expect(state.characters).toEqual({})
    expect(state.words).toEqual({})
    expect(state.unlockedRowIds).toEqual(['a-row'])
  })
})
