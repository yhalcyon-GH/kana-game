import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ASSESSMENT_QUESTION_COUNT } from '../lib/assessment/planner'
import { useAssessmentSession } from './useAssessmentSession'

// Drives a session to completion by answering every question the same way,
// returning the number of questions walked (== ASSESSMENT_QUESTION_COUNT).
function answerAll(result: { current: ReturnType<typeof useAssessmentSession> }, correct: boolean) {
  let steps = 0
  while (!result.current.finished) {
    const question = result.current.currentQuestion!
    act(() => {
      result.current.submitAnswer({
        questionId: question.id,
        family: question.family,
        correct,
        coveredCharIds: question.coveredCharIds,
        targetWordId: 'targetWordId' in question ? question.targetWordId : undefined,
      })
      result.current.advance()
    })
    steps++
  }
  return steps
}

describe('useAssessmentSession', () => {
  it('starts on question 1 of 20 with a defined current question', () => {
    const { result } = renderHook(() => useAssessmentSession('hiragana'))
    expect(result.current.total).toBe(ASSESSMENT_QUESTION_COUNT)
    expect(result.current.index).toBe(0)
    expect(result.current.finished).toBe(false)
    expect(result.current.currentQuestion).toBeDefined()
    expect(result.current.result).toBeNull()
  })

  it('is not finished after only some questions are answered', () => {
    const { result } = renderHook(() => useAssessmentSession('katakana'))
    act(() => {
      const question = result.current.currentQuestion!
      result.current.submitAnswer({ questionId: question.id, family: question.family, correct: true, coveredCharIds: [] })
      result.current.advance()
    })
    expect(result.current.finished).toBe(false)
    expect(result.current.result).toBeNull()
    expect(result.current.index).toBe(1)
  })

  it('finishes after all 20 questions are answered, regardless of score (all wrong)', () => {
    const { result } = renderHook(() => useAssessmentSession('hiragana'))
    const steps = answerAll(result, false)
    expect(steps).toBe(ASSESSMENT_QUESTION_COUNT)
    expect(result.current.finished).toBe(true)
    expect(result.current.result).not.toBeNull()
    expect(result.current.result!.total).toBe(ASSESSMENT_QUESTION_COUNT)
    expect(result.current.result!.correct).toBe(0)
  })

  it('finishes after all 20 questions are answered correctly, with a perfect score', () => {
    const { result } = renderHook(() => useAssessmentSession('katakana'))
    answerAll(result, true)
    expect(result.current.finished).toBe(true)
    expect(result.current.result!.correct).toBe(ASSESSMENT_QUESTION_COUNT)
    expect(result.current.result!.percent).toBe(100)
    // A perfect score has no weak areas to recommend practice for.
    expect(result.current.advice).toEqual([])
  })

  it('restart() builds a fresh 20-question run and clears prior answers/result', () => {
    const { result } = renderHook(() => useAssessmentSession('hiragana'))
    answerAll(result, false)
    expect(result.current.finished).toBe(true)

    act(() => result.current.restart())

    expect(result.current.finished).toBe(false)
    expect(result.current.index).toBe(0)
    expect(result.current.answers).toEqual([])
    expect(result.current.result).toBeNull()
    expect(result.current.total).toBe(ASSESSMENT_QUESTION_COUNT)
  })

  it('restart() bumps attempt, so a UI key combining attempt+question.id can never collide with the previous run', () => {
    const { result } = renderHook(() => useAssessmentSession('hiragana'))
    const attemptBefore = result.current.attempt
    answerAll(result, false)

    act(() => result.current.restart())

    expect(result.current.attempt).toBe(attemptBefore + 1)
  })
})
