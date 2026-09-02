import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorWord } from '../../../data/types'
import type { WordReadingAssessmentQuestion } from '../../../lib/assessment/types'
import { useProgressStore } from '../../../store/progressStore'
import { AssessmentWordReadingQuestion } from './AssessmentWordReadingQuestion'

const words: Record<string, AnchorWord> = {
  'a-ai': { id: 'a-ai', kana: 'あい', romaji: 'ai', meaning: 'love', image: 'word-icons/a-ai.webp', characterIds: ['a', 'i'] },
  'a-ie': { id: 'a-ie', kana: 'いえ', romaji: 'ie', meaning: 'house', image: 'word-icons/a-ie.webp', characterIds: ['i', 'e'] },
  'a-ue': { id: 'a-ue', kana: 'うえ', romaji: 'ue', meaning: 'up / above', characterIds: ['u', 'e'] },
  'a-ao': { id: 'a-ao', kana: 'あお', romaji: 'ao', meaning: 'blue', characterIds: ['a', 'o'] },
}

const question: WordReadingAssessmentQuestion = {
  id: 'word-reading-0',
  family: 'word-reading',
  targetWordId: 'a-ai',
  romajiChoiceWordIds: ['a-ai', 'a-ie', 'a-ue', 'a-ao'],
  coveredCharIds: ['a', 'i'],
}

type MockResultAlternative = { transcript: string }
type MockRecognitionResult = { [index: number]: MockResultAlternative; length: number }
class MockSpeechRecognition {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 3
  onresult: ((event: { results: { [index: number]: MockRecognitionResult; length: number } }) => void) | null = null
  onerror: (() => void) | null = null
  onend: (() => void) | null = null
  static nextBehavior: 'error' | 'success' | 'wrong' = 'error'
  start() {
    setTimeout(() => {
      if (MockSpeechRecognition.nextBehavior === 'error') {
        this.onerror?.()
        return
      }
      const transcript = MockSpeechRecognition.nextBehavior === 'success' ? 'あい' : 'いえ'
      const result: MockRecognitionResult = { 0: { transcript }, length: 1 }
      this.onresult?.({ results: { 0: result, length: 1 } })
    }, 0)
  }
  abort() {}
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  MockSpeechRecognition.nextBehavior = 'error'
  ;(window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = MockSpeechRecognition
})

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
})

describe('AssessmentWordReadingQuestion (Issue #189)', () => {
  it('shows only the kana word before answering — no image, meaning, or romaji', () => {
    render(<AssessmentWordReadingQuestion question={question} wordsById={words} onAnswer={vi.fn()} />)
    // UnbreakableKana splits the word across one <span> per mora, so match
    // on the combined text content rather than a single exact text node.
    expect(screen.getByText((_, element) => element?.textContent === 'あい' && element.tagName === 'SPAN')).toBeInTheDocument()
    expect(screen.queryByText('love')).toBeNull()
    expect(screen.queryByText('ai')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('a speech-recognition infra failure does not score the question wrong — Try Again and Choose in Romaji stay available', async () => {
    const onAnswer = vi.fn()
    render(<AssessmentWordReadingQuestion question={question} wordsById={words} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByTestId('word-reading-speak-button'))
    await waitFor(() => expect(screen.getByText("I couldn't catch that.")).toBeInTheDocument())

    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByText('Try Again')).toBeInTheDocument()
    expect(screen.getByText('Choose in Romaji')).toBeInTheDocument()
    // Still no reveal — the question is not finalized by an unrecognized attempt.
    expect(screen.queryByText('love')).toBeNull()
  })

  it('a confidently recognized WRONG reading also does not auto-score wrong (mirrors Restaurant/Cafe speech handling)', async () => {
    const onAnswer = vi.fn()
    MockSpeechRecognition.nextBehavior = 'wrong'
    render(<AssessmentWordReadingQuestion question={question} wordsById={words} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByTestId('word-reading-speak-button'))
    await waitFor(() => expect(screen.getByText("I couldn't catch that.")).toBeInTheDocument())

    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('a successfully recognized correct reading finalizes the answer as correct, revealing romaji/meaning/image', async () => {
    const onAnswer = vi.fn()
    MockSpeechRecognition.nextBehavior = 'success'
    render(<AssessmentWordReadingQuestion question={question} wordsById={words} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByTestId('word-reading-speak-button'))
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true))

    expect(screen.getByText('ai')).toBeInTheDocument()
    expect(screen.getByText('love')).toBeInTheDocument()
    expect(document.querySelector('img')).not.toBeNull()
  })

  it('Choose in Romaji: selecting the correct word finalizes onAnswer(true) and reveals the answer', () => {
    const onAnswer = vi.fn()
    render(<AssessmentWordReadingQuestion question={question} wordsById={words} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByText('Choose in Romaji'))
    fireEvent.click(screen.getByTestId('word-reading-romaji-a-ai'))

    expect(onAnswer).toHaveBeenCalledWith(true)
    expect(screen.getByText('Correct!')).toBeInTheDocument()
    expect(screen.getByText('love')).toBeInTheDocument()
  })

  it('Choose in Romaji: selecting a wrong word finalizes onAnswer(false) and still reveals the correct answer', () => {
    const onAnswer = vi.fn()
    render(<AssessmentWordReadingQuestion question={question} wordsById={words} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByText('Choose in Romaji'))
    fireEvent.click(screen.getByTestId('word-reading-romaji-a-ie'))

    expect(onAnswer).toHaveBeenCalledWith(false)
    expect(screen.getByText('Not quite.')).toBeInTheDocument()
    // Reveals the CORRECT word's info, not the wrongly-chosen one.
    expect(screen.getByText('ai')).toBeInTheDocument()
    expect(screen.getByText('love')).toBeInTheDocument()
  })

  it('romaji choices never include image/meaning that could reveal the answer before choosing', () => {
    render(<AssessmentWordReadingQuestion question={question} wordsById={words} onAnswer={vi.fn()} />)
    fireEvent.click(screen.getByText('Choose in Romaji'))
    expect(screen.queryByText('love')).toBeNull()
    expect(screen.queryByText('house')).toBeNull()
  })
})
