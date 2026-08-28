import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { KanaTypingPage } from './KanaTypingPage'

const MEANING_TO_KANA: Record<string, string> = { love: 'あい', house: 'いえ', 'up / above': 'うえ', blue: 'あお' }

function renderRowTyping() {
  return render(
    <MemoryRouter initialEntries={['/practice/hiragana/a-row/kana-typing']}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId/kana-typing" element={<KanaTypingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderReviewTyping() {
  return render(
    <MemoryRouter initialEntries={['/practice/review/kana-typing']}>
      <Routes>
        <Route path="/practice/review/kana-typing" element={<KanaTypingPage rowIdOverride={REVIEW_SCOPE_ID} />} />
      </Routes>
    </MemoryRouter>,
  )
}

function finishVisibleTypingSessionKeepingHouseWeak(container: HTMLElement) {
  for (let round = 0; round < 6; round++) {
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: meaning === 'love' ? 'あい' : 'wrong' } })
      fireEvent.submit(container.querySelector('form')!)
    })
    if (meaning === 'love') {
      act(() => vi.advanceTimersByTime(2000))
    } else {
      const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Next'))!
      act(() => fireEvent.click(next))
    }
  }
}

describe('KanaTypingPage script-strict, romaji-rejecting answers (Issue #17)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
  })

  it('accepts the exact target kana', () => {
    const { container } = renderRowTyping()
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const kana = MEANING_TO_KANA[meaning]
    expect(kana).toBeDefined()
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: kana } })
      fireEvent.submit(container.querySelector('form')!)
    })
    expect(input).toHaveClass('border-green-500')
  })

  it('rejects raw Latin romaji for a hiragana target', () => {
    const { container } = renderRowTyping()
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'ai' } })
      fireEvent.submit(container.querySelector('form')!)
    })
    expect(input).toHaveClass('border-red-500')
  })

  it('does not show the target kana or romaji before answering', () => {
    const { container } = renderRowTyping()
    for (const kana of Object.values(MEANING_TO_KANA)) {
      expect(container.textContent).not.toContain(kana)
    }
    expect(container.textContent).not.toMatch(/\bai\b|\bie\b|\bue\b|\bao\b/)
  })

  it('shows meaning and a Replay audio button as the available prompts', () => {
    const { container, queryByText } = renderRowTyping()
    expect(container.querySelector('.text-lg.font-semibold')?.textContent).toBeTruthy()
    expect(queryByText(/Replay/)).not.toBeNull()
  })

  it('reveals the correct kana after a wrong answer', () => {
    const { container } = renderRowTyping()
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const kana = MEANING_TO_KANA[meaning]
    expect(kana).toBeDefined()
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'wrong' } })
      fireEvent.submit(container.querySelector('form')!)
    })
    // AnswerReveal shows the correct kana per-character (see AnswerReveal.tsx).
    const revealedKana = [...kana].map((ch) => container.textContent?.includes(ch))
    expect(revealedKana.every(Boolean)).toBe(true)
  })

  it('does not evaluate/submit while an IME composition is in progress', () => {
    const { container } = renderRowTyping()
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const kana = MEANING_TO_KANA[meaning]
    expect(kana).toBeDefined()
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.compositionStart(input)
      fireEvent.change(input, { target: { value: kana } })
      fireEvent.submit(container.querySelector('form')!)
    })
    // Still unanswered — composition hasn't ended, so submit must be a no-op.
    expect(input).not.toHaveClass('border-green-500')
    expect(input).not.toHaveClass('border-red-500')
    expect(input).not.toBeDisabled()

    act(() => {
      fireEvent.compositionEnd(input)
      fireEvent.submit(container.querySelector('form')!)
    })
    expect(input).toHaveClass('border-green-500')
  })

  it('shows compact first-use guidance for entering Japanese', () => {
    const { queryByText } = renderRowTyping()
    expect(queryByText('Use a Japanese keyboard')).not.toBeNull()
  })

  it('does not update character box/SRS/Review or mastery on either a correct or wrong answer', () => {
    const { container } = renderRowTyping()
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const kana = MEANING_TO_KANA[meaning]
    expect(kana).toBeDefined()
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: kana } })
      fireEvent.submit(container.querySelector('form')!)
    })
    // characters state was only initialized by markRowTaught above (via
    // Learn), never touched by Kana Typing's own answer.
    const characters = useProgressStore.getState().characters
    expect(characters['a']?.totalSeen ?? 0).toBe(0)
    expect(characters['a']?.box ?? 0).toBe(0)
    expect(Object.values(characters).every((c) => !c.reviewActive)).toBe(true)
  })
})

describe('KanaTypingPage Review session', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
    // Two weak words (a-ai "love", a-ie "house"), each activated via a
    // miss, so the live Review pool stays non-empty after the first one
    // graduates out below.
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    useProgressStore.getState().recordWordReviewResult('a-ie', false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Regression: Review's word pool is recalculated live from progress state
  // (see useCurriculum's mistake-driven weak-word selection). Answering the
  // first weak word correctly can graduate it out of Review and remove it
  // from that live pool immediately — while its id is still
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
    const firstKana = MEANING_TO_KANA[firstMeaning]
    expect(firstKana).toBeDefined()

    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: firstKana } })
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

  it('Play Again captures the Review pool that is current after the completed attempt', () => {
    vi.useFakeTimers()
    const { container, getByRole } = renderReviewTyping()

    finishVisibleTypingSessionKeepingHouseWeak(container)
    expect(getByRole('button', { name: /play again/i })).toBeInTheDocument()

    act(() => {
      fireEvent.click(getByRole('button', { name: /play again/i }))
    })

    expect(container.querySelector('p.text-sm')?.textContent).toMatch('Round 1 / 3')
  })

  it('Review-scoped answers follow the same script-strict, romaji-rejecting rule', () => {
    vi.useFakeTimers()
    const { container } = renderReviewTyping()
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const romaji = meaning === 'love' ? 'ai' : 'ie'
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: romaji } })
      fireEvent.submit(container.querySelector('form')!)
    })
    expect(input).toHaveClass('border-red-500')
  })
})

describe('KanaTypingPage word-only Review (Issue #2)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
  })

  it('a wrong answer activates word Review but does NOT touch character Review', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row/kana-typing']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/kana-typing" element={<KanaTypingPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'definitely-wrong' } })
      fireEvent.submit(container.querySelector('form')!)
    })

    const words = useProgressStore.getState().words
    const characters = useProgressStore.getState().characters
    expect(Object.values(words).some((w) => w.reviewActive)).toBe(true)
    expect(Object.values(characters).every((c) => !c.reviewActive)).toBe(true)
  })
})

// The completed-session summary shows the real played correct/total count
// as a compact "{correct}/{total}" score (see PracticeSummary) instead of a
// computed Accuracy percentage or the old "{total}問中{correct}問正解" text
// — see "fix: redesign practice result summary".
describe('KanaTypingPage result summary (correct/total count)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the actual played total and a perfect correct count when every answer is right', () => {
    vi.useFakeTimers()
    const { container } = renderRowTyping()

    for (let round = 0; round < 8; round++) {
      const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
      const kana = MEANING_TO_KANA[meaning]
      const input = container.querySelector('input') as HTMLInputElement
      act(() => {
        fireEvent.change(input, { target: { value: kana } })
        fireEvent.submit(container.querySelector('form')!)
      })
      act(() => vi.advanceTimersByTime(2000))
    }

    expect(container.textContent).toContain('8/8')
    expect(container.textContent).not.toMatch(/問中/)
    expect(container.textContent).not.toMatch(/問正解/)
    expect(container.textContent).not.toMatch(/その調子/)
    expect(container.textContent).not.toMatch(/Accuracy/i)
    expect(container.textContent).not.toMatch(/%/)
  })

  it('shows a zero correct count when every answer is wrong', () => {
    vi.useFakeTimers()
    const { container } = renderRowTyping()

    for (let round = 0; round < 8; round++) {
      const input = container.querySelector('input') as HTMLInputElement
      act(() => {
        fireEvent.change(input, { target: { value: 'definitely-wrong' } })
        fireEvent.submit(container.querySelector('form')!)
      })
      const next = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))!
      act(() => fireEvent.click(next))
    }

    expect(container.textContent).toContain('0/8')
  })

  it('a shorter Review session shows the actual (non-8) played total, not a fixed session length', () => {
    vi.useFakeTimers()
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    const { container } = renderReviewTyping()

    let guard = 0
    let correct = 0
    while (!container.textContent?.includes('complete!') && guard < 20) {
      const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
      const kana = MEANING_TO_KANA[meaning]
      const input = container.querySelector('input') as HTMLInputElement
      act(() => {
        fireEvent.change(input, { target: { value: kana } })
        fireEvent.submit(container.querySelector('form')!)
      })
      correct += 1
      act(() => vi.advanceTimersByTime(2000))
      guard += 1
    }

    expect(container.textContent).toMatch(/complete!/)
    expect(container.textContent).toMatch(new RegExp(`${correct}/\\d`))
    expect(container.textContent).not.toMatch(/\/8\b/)
  })
})

// Pre-answer mascot state (see "fix: show thinking mascot before
// answering") — before the learner submits an answer, Tamamizu shows the
// "thinking" artwork (mood 'normal' -> mascot/normal.webp); after
// answering, the existing correct/incorrect reaction still takes over.
describe('KanaTypingPage pre-answer mascot', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the thinking mascot (mascot/normal.webp) before the learner answers', () => {
    const { container } = renderRowTyping()
    const mascotImg = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotImg).not.toBeNull()
    expect(mascotImg.src).toContain('mascot/normal.webp')
  })

  it('switches to a reaction mascot after answering, and back to normal on the next round', () => {
    vi.useFakeTimers()
    const { container } = renderRowTyping()
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'definitely-wrong' } })
      fireEvent.submit(container.querySelector('form')!)
    })

    const mascotAfterAnswer = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotAfterAnswer.src).toContain('mascot/incorrect.webp')

    const next = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))!
    act(() => fireEvent.click(next))
    const mascotNextRound = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotNextRound.src).toContain('mascot/normal.webp')
  })
})
