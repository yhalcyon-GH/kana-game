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
  blankIndex: 1, correct: '×', choices: ['×', 'っ'], diagnostic: 'no-insertion',
}

const soundLengthWords = Object.entries(WORDS_BY_ROW)
  .filter(([rowId]) => rowId === 'sokuon-row' || rowId.startsWith('chouon-'))
  .flatMap(([, rowWords]) => rowWords)

function questionFor(wordId: string, blankIndex: number, correct: string): SoundLengthQuestion {
  const matchingWord = soundLengthWords.find((candidate) => candidate.id === wordId)!
  return {
    domain: correct === '×' ? 'no-insertion' : correct === 'っ' || correct === 'ッ' ? 'sokuon' : 'long-vowel',
    word: matchingWord,
    prompt: '',
    blankIndex,
    correct,
    choices: [correct],
    diagnostic: correct === '×' ? 'no-insertion' : 'hiragana-vowel',
  }
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

  it.each([
    ['chouon-o-otouto', 2, 'う', 'おとうと'],
    ['chouon-i-ojiisan', 2, 'い', 'おじいさん'],
    ['sokuon-otto', 1, 'っ', 'おっと'],
    ['chouon-katakana-biiru', 1, 'ー', 'ビール'],
  ] as const)('highlights only the inserted character in the completed word for %s', (wordId, blankIndex, correct, completedWord) => {
    const revealQuestion = questionFor(wordId, blankIndex, correct)
    soundPlan.build.mockReturnValue({ questions: Array.from({ length: 20 }, () => revealQuestion) })
    render(<MemoryRouter><SoundLengthAssessmentPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: correct }))

    const reveal = screen.getByTestId('sound-length-word-reveal')
    const highlighted = screen.getByTestId('sound-length-correct-character')
    expect(reveal).toHaveTextContent(completedWord)
    expect(reveal).not.toHaveTextContent(`(${correct})`)
    expect(highlighted).toHaveTextContent(correct)
    expect(highlighted).toHaveClass('text-red-600')
  })

  it.each([
    ['chouon-i-ojisan', 2, 'おじさん'],
    ['chouon-a-obasan', 2, 'おばさん'],
  ] as const)('shows a no-insertion answer without a parenthetical or red character for %s', (wordId, blankIndex, completedWord) => {
    const revealQuestion = questionFor(wordId, blankIndex, '×')
    soundPlan.build.mockReturnValue({ questions: Array.from({ length: 20 }, () => revealQuestion) })
    render(<MemoryRouter><SoundLengthAssessmentPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: '×' }))

    const reveal = screen.getByTestId('sound-length-word-reveal')
    expect(reveal).toHaveTextContent(completedWord)
    expect(reveal).not.toHaveTextContent('(×)')
    expect(screen.queryByTestId('sound-length-correct-character')).not.toBeInTheDocument()
  })
})
