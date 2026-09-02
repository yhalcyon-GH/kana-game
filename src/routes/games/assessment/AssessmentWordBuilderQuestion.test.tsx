import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgressStore } from '../../../store/progressStore'
import type { WordBuilderAssessmentQuestion } from '../../../lib/assessment/types'
import { AssessmentWordBuilderQuestion } from './AssessmentWordBuilderQuestion'

const targetWord = {
  id: 'a-ai',
  kana: 'あい',
  romaji: 'ai',
  meaning: 'love',
  image: 'word-icons/a-ai.webp',
  characterIds: ['a', 'i'],
}

const question: WordBuilderAssessmentQuestion = {
  id: 'word-builder-0',
  family: 'word-builder',
  targetWordId: 'a-ai',
  distractorCharIds: ['ka', 'ki'],
  coveredCharIds: ['a', 'i'],
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

describe('AssessmentWordBuilderQuestion (Issue #189 assessment mode)', () => {
  it('hides the word image and meaning before answering', () => {
    render(<AssessmentWordBuilderQuestion question={question} wordsById={{ 'a-ai': targetWord }} onAnswer={vi.fn()} />)
    expect(screen.queryByText('love')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('never shows romaji on the tray tiles, even pre-answer', () => {
    render(<AssessmentWordBuilderQuestion question={question} wordsById={{ 'a-ai': targetWord }} onAnswer={vi.fn()} />)
    expect(screen.queryByText('ai')).toBeNull()
  })

  it('reveals the image, meaning, and per-character kana/romaji once answered wrong, and reports onAnswer(false)', () => {
    const onAnswer = vi.fn()
    render(<AssessmentWordBuilderQuestion question={question} wordsById={{ 'a-ai': targetWord }} onAnswer={onAnswer} />)

    // Fill both slots with the wrong (distractor) tiles.
    fireEvent.click(screen.getByText('か'))
    fireEvent.click(screen.getByText('き'))

    expect(onAnswer).toHaveBeenCalledWith(false)
    expect(screen.getByText('love')).toBeInTheDocument()
    expect(document.querySelector('img')).not.toBeNull()
    // AnswerReveal shows each correct character's own romaji.
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('i')).toBeInTheDocument()
  })

  it('reports onAnswer(true) exactly once when the correct tiles are placed in order', () => {
    const onAnswer = vi.fn()
    render(<AssessmentWordBuilderQuestion question={question} wordsById={{ 'a-ai': targetWord }} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByText('あ'))
    fireEvent.click(screen.getByText('い'))

    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith(true)
  })
})
