import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INTRO_GUIDE_STEPS } from '../data/introGuide'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from '../data/introGuideContent'
import { useProgressStore } from '../store/progressStore'
import { IntroGuide } from './IntroGuide'
import { LearnTracingGuide } from './LearnTracingGuide'
import { PracticeGuide } from './PracticeGuide'
import { ReviewGuide } from './ReviewGuide'

const tts = vi.hoisted(() => ({
  speak: vi.fn(),
  speakStaticOnly: vi.fn(() => Promise.resolve(true)),
  stop: vi.fn(),
}))

vi.mock('../hooks/useTTS', () => ({
  useTTS: () => tts,
}))

const introLocale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  tts.speak.mockReset()
  tts.speakStaticOnly.mockReset()
  tts.speakStaticOnly.mockResolvedValue(true)
  tts.stop.mockReset()
})

describe('guide narration cleanup (Issue #37)', () => {
  it('stops Introduction narration before moving to the next step', () => {
    const { getByText } = render(<IntroGuide />)

    fireEvent.click(getByText(introLocale.nextLabel))

    expect(tts.stop).toHaveBeenCalledOnce()
  })

  it('stops Introduction narration when Skip is pressed', () => {
    const { getByText } = render(<IntroGuide />)

    fireEvent.click(getByText(introLocale.skipLabel))

    expect(tts.stop).toHaveBeenCalledOnce()
  })

  it('stops Introduction narration when the final button is pressed', () => {
    const { getByText } = render(<IntroGuide />)
    for (let index = 0; index < INTRO_GUIDE_STEPS.length - 1; index++) {
      fireEvent.click(getByText(introLocale.nextLabel))
    }
    tts.stop.mockClear()

    fireEvent.click(getByText(introLocale.finalLabel))

    expect(tts.stop).toHaveBeenCalledOnce()
  })

  it('stops Introduction narration when the guide unmounts', () => {
    const guide = render(<IntroGuide />)
    tts.stop.mockClear()

    guide.unmount()

    expect(tts.stop).toHaveBeenCalledOnce()
  })

  it.each([
    ['Learn / Tracing', <LearnTracingGuide key="learn-tracing-dismiss" />],
    ['Practice', <PracticeGuide key="practice-dismiss" />],
    ['Review', <ReviewGuide key="review-dismiss" />],
  ])('stops %s Guide narration when Got it! is pressed', (_name, component) => {
    const { getByText } = render(component)

    fireEvent.click(getByText('Got it!'))

    expect(tts.stop).toHaveBeenCalledOnce()
  })

  it.each([
    ['Learn / Tracing', <LearnTracingGuide key="learn-tracing-unmount" />],
    ['Practice', <PracticeGuide key="practice-unmount" />],
    ['Review', <ReviewGuide key="review-unmount" />],
  ])('stops %s Guide narration when the guide unmounts', (_name, component) => {
    const guide = render(component)
    tts.stop.mockClear()

    guide.unmount()

    expect(tts.stop).toHaveBeenCalledOnce()
  })
})
