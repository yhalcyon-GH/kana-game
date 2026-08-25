import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { INTRO_GUIDE_STEPS } from '../data/introGuide'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from '../data/introGuideContent'
import { useProgressStore } from '../store/progressStore'
import { IntroGuide } from './IntroGuide'

const locale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]

beforeEach(() => {
  useProgressStore.getState().resetProgress()
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
