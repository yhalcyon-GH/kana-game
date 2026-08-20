import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { ListeningPage } from './ListeningPage'

const MEANING_TO_KANA: Record<string, string> = { love: 'あい', house: 'いえ' }

function renderReviewListening() {
  return render(
    <MemoryRouter initialEntries={['/practice/review/listening']}>
      <Routes>
        <Route path="/practice/review/listening" element={<ListeningPage rowIdOverride={REVIEW_SCOPE_ID} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ListeningPage Review session', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
    // Two weak words so the live Review pool stays non-empty (no "nothing
    // weak" fallback) after the first one drops out below.
    useProgressStore.getState().adjustWordReviewScore('a-ai', 5)
    useProgressStore.getState().adjustWordReviewScore('a-ie', 5)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Same regression as KanaTypingPage: answering the first weak word
  // correctly drops it below the weak threshold, removing it from Review's
  // live pool while the game's own setTimeout(advance, 2000) is still
  // pending (ListeningPage's timer isn't tied to a useEffect cleanup, so a
  // stray auto-skip firing before it would leave TWO advances racing).
  it('answering the first weak word correctly advances exactly one round, not two', () => {
    vi.useFakeTimers()
    const { container } = renderReviewListening()

    const roundText = () => container.querySelector('p')!.textContent!
    const meaningText = () => container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()

    expect(roundText()).toMatch('Round 1 / 6')
    const targetKana = MEANING_TO_KANA[meaningText()]
    expect(targetKana).toBeDefined()

    const correctButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.font-kana')?.textContent === targetKana,
    )!
    expect(correctButton).toBeDefined()

    act(() => {
      fireEvent.click(correctButton)
    })

    // The correct-answer timer hasn't fired yet — must not have advanced yet.
    expect(roundText()).toMatch('Round 1 / 6')

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Exactly one round advanced — not skipped an extra, unanswered round.
    expect(roundText()).toMatch('Round 2 / 6')
    expect(container.querySelector('.grid.grid-cols-2')).not.toBeNull()
  })
})
