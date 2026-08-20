import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { KanaTypingPage } from './KanaTypingPage'

const MEANING_TO_ROMAJI: Record<string, string> = { love: 'ai', house: 'ie' }

function renderReviewTyping() {
  return render(
    <MemoryRouter initialEntries={['/practice/review/kana-typing']}>
      <Routes>
        <Route path="/practice/review/kana-typing" element={<KanaTypingPage rowIdOverride={REVIEW_SCOPE_ID} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('KanaTypingPage Review session', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
    // Two weak words (a-ai "love", a-ie "house") so the live Review pool
    // stays non-empty (no "nothing weak" fallback) after the first one drops
    // out below.
    useProgressStore.getState().adjustWordReviewScore('a-ai', 5)
    useProgressStore.getState().adjustWordReviewScore('a-ie', 5)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Regression: Review's word pool is recalculated live from progress state
  // (see useCurriculum's mistake-driven weak-word selection). Answering the
  // first weak word correctly drops its reviewScore below the threshold and
  // removes it from that live pool immediately — while its id is still
  // queued for the round the learner is currently ON. The fix must resolve
  // every queued round against a snapshot taken at session start, so the
  // in-flight round finishes normally and the NEXT round is never skipped.
  it('answering the first weak word correctly advances exactly one round, not two', () => {
    vi.useFakeTimers()
    const { container } = renderReviewTyping()

    const roundText = () => container.querySelector('p.text-sm')!.textContent!
    const meaningText = () => container.querySelector('.text-lg.font-semibold')!.textContent!.trim()

    expect(roundText()).toMatch('Round 1 / 6')
    const firstMeaning = meaningText()
    const firstRomaji = MEANING_TO_ROMAJI[firstMeaning]
    expect(firstRomaji).toBeDefined()

    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: firstRomaji } })
    })
    act(() => {
      fireEvent.submit(container.querySelector('form')!)
    })

    // The correct-answer timer hasn't fired yet — the round must not have
    // advanced already (no premature skip before the "Correct!" delay ends).
    expect(roundText()).toMatch('Round 1 / 6')

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Exactly one round advanced — the live pool losing the just-answered
    // word must not cause a second, unanswered round to be skipped too.
    expect(roundText()).toMatch('Round 2 / 6')

    // The new round must be genuinely answerable, not stuck/blank.
    expect(container.querySelector('input')).not.toBeNull()
    const secondMeaning = meaningText()
    expect(secondMeaning).not.toBe('')
  })
})
