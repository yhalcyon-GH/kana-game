import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoundLengthAssessmentPage } from './SoundLengthAssessmentPage'
import { useProgressStore } from '../../store/progressStore'
import { WORDS_BY_ROW } from '../../data/words'
import type { SoundLengthQuestion } from '../../lib/soundLengthAssessmentPlan'

const tts = vi.hoisted(() => ({ speak: vi.fn(), speakStaticOnly: vi.fn(() => Promise.resolve(true)), stop: vi.fn(), supported: true }))
const soundPlan = vi.hoisted(() => ({ build: vi.fn() }))
vi.mock('../../hooks/useTTS', () => ({ useTTS: () => tts }))
vi.mock('../../lib/soundLengthAssessmentPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/soundLengthAssessmentPlan')>()
  return { ...actual, buildSoundLengthAssessmentPlan: soundPlan.build }
})

const word = WORDS_BY_ROW['sokuon-row'][0]
const question: SoundLengthQuestion = {
  domain: 'no-insertion', word, prompt: `${word.kana[0]}□${word.kana.slice(1)}`,
  correct: '×', choices: ['×', 'っ'], diagnostic: 'no-insertion',
}

describe('SoundLengthAssessmentPage', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    tts.speak.mockReset()
    soundPlan.build.mockReturnValue({ questions: Array.from({ length: 20 }, () => question) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays the target once when a question appears and keeps replay available', async () => {
    render(<MemoryRouter><SoundLengthAssessmentPage /></MemoryRouter>)

    await waitFor(() => expect(tts.speak).toHaveBeenCalledTimes(1))
    expect(tts.speak.mock.calls[0]?.[0]).toMatch(/^words\//)
    expect(screen.getByTestId('sound-length-blank')).toHaveAttribute('aria-label', 'blank')
    expect(screen.getByTestId('sound-length-prompt')).not.toHaveTextContent('□')

    fireEvent.click(screen.getByRole('button', { name: /replay audio/i }))
    expect(tts.speak).toHaveBeenCalledTimes(2)
  })

  it('shows Tamamizu feedback and waits for Next after a correct answer', async () => {
    vi.useFakeTimers()
    render(<MemoryRouter><SoundLengthAssessmentPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: '×' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(screen.getByTestId('mascot-stage')).toBeInTheDocument()
    expect(tts.speak.mock.calls.some(([key]) => String(key).startsWith('feedback/'))).toBe(true)

    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByText('Question 1 / 20')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Question 2 / 20')).toBeInTheDocument()
  })

  it('shows score, mistakes, retry, and navigation on the result screen', async () => {
    vi.useFakeTimers()
    render(<MemoryRouter><SoundLengthAssessmentPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'っ' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    for (let index = 1; index < 20; index++) {
      fireEvent.click(screen.getByRole('button', { name: '×' }))
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

    expect(screen.getByText('PASS')).toBeInTheDocument()
    expect(screen.getByTestId('assessment-result-image')).toHaveAttribute('src', expect.stringContaining('assessment-pass.png'))
    expect(screen.getByText('95%')).toBeInTheDocument()
    expect(screen.getByText('19 of 20 correct')).toBeInTheDocument()
    expect(screen.getByText('Missed this round')).toBeInTheDocument()
    expect(screen.getByText(word.kana, { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/youon')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/other')
  })
})
