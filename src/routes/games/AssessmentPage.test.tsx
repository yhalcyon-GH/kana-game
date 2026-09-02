import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgressStore } from '../../store/progressStore'
import * as sessionModule from '../../hooks/useAssessmentSession'
import type { AssessmentAnswer, AssessmentFamilyScore, AssessmentResult, KanaQuizAssessmentQuestion } from '../../lib/assessment/types'
import { AssessmentPage } from './AssessmentPage'

vi.mock('../../hooks/useAssessmentSession')

const kanaQuizQuestion: KanaQuizAssessmentQuestion = {
  id: 'kana-quiz-0',
  family: 'kana-quiz',
  mode: 'read',
  targetCharId: 'a',
  choiceCharIds: ['a', 'ka', 'sa', 'ta'],
  coveredCharIds: ['a'],
}

const zeroScore: AssessmentFamilyScore = { correct: 0, total: 0 }

function buildResult(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    script: 'hiragana',
    correct: 3,
    total: 20,
    percent: 15,
    familyScores: { 'kana-quiz': zeroScore, listening: zeroScore, 'word-builder': zeroScore, 'word-reading': zeroScore },
    weakCharIds: [],
    weakWordIds: [],
    ...overrides,
  }
}

function mockSession(overrides: Partial<ReturnType<typeof sessionModule.useAssessmentSession>> = {}) {
  const base: ReturnType<typeof sessionModule.useAssessmentSession> = {
    scope: { script: 'hiragana', characterIds: [], words: [] },
    plan: [kanaQuizQuestion],
    currentQuestion: kanaQuizQuestion,
    index: 0,
    total: 20,
    answers: [],
    finished: false,
    result: null,
    advice: [],
    attempt: 0,
    submitAnswer: vi.fn(),
    advance: vi.fn(),
    restart: vi.fn(),
    ...overrides,
  }
  vi.mocked(sessionModule.useAssessmentSession).mockReturnValue(base)
  return base
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AssessmentPage script="hiragana" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  vi.clearAllMocks()
})

describe('AssessmentPage (Issue #189)', () => {
  it('does not mark the test completed while a question is still in progress', () => {
    mockSession({ finished: false })
    renderPage()
    expect(useProgressStore.getState().isAssessmentCompleted('hiragana')).toBe(false)
  })

  it('does not show "Next Question" until the current question has an answer', () => {
    mockSession({ index: 0, answers: [] })
    renderPage()
    expect(screen.queryByTestId('assessment-next-question')).toBeNull()
  })

  it('shows "Next Question" once the current question has an answer recorded', () => {
    const answer: AssessmentAnswer = { questionId: 'kana-quiz-0', family: 'kana-quiz', correct: true, coveredCharIds: ['a'] }
    mockSession({ index: 0, answers: [answer] })
    renderPage()
    expect(screen.getByTestId('assessment-next-question')).toBeInTheDocument()
  })

  it('marks the test completed once finished — even with a low score', () => {
    mockSession({ finished: true, result: buildResult({ correct: 2 }), advice: [] })
    renderPage()
    expect(useProgressStore.getState().isAssessmentCompleted('hiragana')).toBe(true)
  })

  it('marks the test completed once finished with a perfect score too — score never gates completion', () => {
    mockSession({ finished: true, result: buildResult({ correct: 20, percent: 100 }), advice: [] })
    renderPage()
    expect(useProgressStore.getState().isAssessmentCompleted('hiragana')).toBe(true)
  })

  it('shows the results screen with the overall score once finished', () => {
    mockSession({ finished: true, result: buildResult(), advice: [] })
    renderPage()
    expect(screen.getByText('Hiragana Test complete!')).toBeInTheDocument()
  })

  it('never calls a Review/SRS/character-progress store action from the page itself', () => {
    const recordResult = vi.spyOn(useProgressStore.getState(), 'recordResult')
    const recordCharacterReviewResult = vi.spyOn(useProgressStore.getState(), 'recordCharacterReviewResult')
    const recordWordReviewResult = vi.spyOn(useProgressStore.getState(), 'recordWordReviewResult')
    mockSession({ finished: true, result: buildResult(), advice: [] })
    renderPage()
    expect(recordResult).not.toHaveBeenCalled()
    expect(recordCharacterReviewResult).not.toHaveBeenCalled()
    expect(recordWordReviewResult).not.toHaveBeenCalled()
  })
})
