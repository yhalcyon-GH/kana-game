import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KANA_INTRO_EXCERPT_STEP_IDS } from '../data/kanaIntroExcerptGuide'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from '../data/introGuideContent'
import { DEFAULT_KANA_INTRO_EXCERPT_GUIDE_LOCALE, KANA_INTRO_EXCERPT_GUIDE_CONTENT } from '../data/kanaIntroExcerptGuideContent'
import { KanaIntroExcerptGuide } from './KanaIntroExcerptGuide'

const locale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]
const excerptLocale = KANA_INTRO_EXCERPT_GUIDE_CONTENT[DEFAULT_KANA_INTRO_EXCERPT_GUIDE_LOCALE]

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))
vi.mock('../hooks/useTTS', () => ({ useTTS: () => tts }))

beforeEach(() => {
  tts.speak.mockReset()
  tts.stop.mockReset()
})

describe('KanaIntroExcerptGuide Back navigation', () => {
  it('Next then Back returns to the previous step', () => {
    const onDismiss = vi.fn()
    const firstId = KANA_INTRO_EXCERPT_STEP_IDS[0]
    const secondId = KANA_INTRO_EXCERPT_STEP_IDS[1]
    const { getByText } = render(<KanaIntroExcerptGuide onDismiss={onDismiss} />)

    expect(getByText(locale.steps[firstId].subtitle)).toBeInTheDocument()
    fireEvent.click(getByText(excerptLocale.nextLabel))
    expect(getByText(locale.steps[secondId].subtitle)).toBeInTheDocument()

    fireEvent.click(getByText('Back'))
    expect(getByText(locale.steps[firstId].subtitle)).toBeInTheDocument()
  })

  it('Back is disabled on the first step', () => {
    const { getByText } = render(<KanaIntroExcerptGuide onDismiss={vi.fn()} />)
    expect(getByText('Back')).toBeDisabled()
  })

  it('Back does not dismiss or mutate progress', () => {
    const onDismiss = vi.fn()
    const { getByText } = render(<KanaIntroExcerptGuide onDismiss={onDismiss} />)
    fireEvent.click(getByText(excerptLocale.nextLabel))
    fireEvent.click(getByText('Back'))
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
