import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoundLengthAssessmentPage } from './SoundLengthAssessmentPage'
import { useProgressStore } from '../../store/progressStore'
import { WORDS_BY_ROW } from '../../data/words'
import type { SoundLengthQuestion } from '../../lib/soundLengthAssessmentPlan'

const tts = vi.hoisted(() => ({ speak: vi.fn(), supported: true }))
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

    fireEvent.click(screen.getByRole('button', { name: /replay audio/i }))
    expect(tts.speak).toHaveBeenCalledTimes(2)
  })

  it('shows score, mistakes, retry, and navigation on the result screen', async () => {
    vi.useFakeTimers()
    render(<MemoryRouter><SoundLengthAssessmentPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'っ' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    for (let index = 1; index < 20; index++) {
      fireEvent.click(screen.getByRole('button', { name: '×' }))
      act(() => vi.advanceTimersByTime(900))
    }

    expect(screen.getByText('95%')).toBeInTheDocument()
    expect(screen.getByText('19 / 20 correct')).toBeInTheDocument()
    expect(screen.getByText('Missed this round')).toBeInTheDocument()
    expect(screen.getByText(word.kana, { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/youon')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/other')
  })
})
