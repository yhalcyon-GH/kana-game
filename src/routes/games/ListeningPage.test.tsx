import { act, fireEvent, render, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORDS_BY_ROW } from '../../data/words'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { ListeningPage } from './ListeningPage'

// Lets one specific test force a queue with consecutive-duplicate ids (the
// real queue builder deliberately never produces that whenever more than
// one distinct id exists — see practiceSelection.ts's
// arrangeNoConsecutiveRepeats), while every other test keeps the real
// weighted-sampling behavior untouched (`queueOverride` defaults to
// undefined, which falls through to the actual implementation).
const { queueOverride } = vi.hoisted(() => ({ queueOverride: { current: undefined as string[] | undefined } }))
vi.mock('../../lib/practiceSelection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/practiceSelection')>()
  return {
    ...actual,
    buildWeightedQueue: (ids: string[], weight: (id: string) => number, count: number) =>
      queueOverride.current ?? actual.buildWeightedQueue(ids, weight, count),
  }
})

function renderRowListening() {
  return render(
    <MemoryRouter initialEntries={['/practice/hiragana/a-row/listening']}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId/listening" element={<ListeningPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Mode-agnostic round driver (doesn't care about correctness) — for tests
// that only care about session-level structure (completion, length).
function clickThroughListeningRound(container: HTMLElement) {
  const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
  act(() => fireEvent.click(buttons[0]))
  const next = within(container).queryByRole('button', { name: /next/i })
  if (next) {
    act(() => fireEvent.click(next))
  } else {
    act(() => vi.advanceTimersByTime(2000))
  }
}

const MEANING_TO_KANA: Record<string, string> = { love: 'あい', house: 'いえ', 'up / above': 'うえ', blue: 'あお' }
const MEANING_TO_ROMAJI: Record<string, string> = { love: 'ai', house: 'ie', 'up / above': 'ue', blue: 'ao' }

function renderReviewListening() {
  return render(
    <MemoryRouter initialEntries={['/practice/review/listening']}>
      <Routes>
        <Route path="/practice/review/listening" element={<ListeningPage rowIdOverride={REVIEW_SCOPE_ID} />} />
      </Routes>
    </MemoryRouter>,
  )
}

function finishVisibleListeningSession(container: HTMLElement) {
  for (let round = 0; round < 6; round++) {
    const meaning = container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()
    const targetKana = MEANING_TO_KANA[meaning]
    const choices = Array.from(container.querySelectorAll('button'))
    const choice = choices.find((button) => button.querySelector('.font-kana')?.textContent === targetKana)!

    act(() => fireEvent.click(choice))
    act(() => vi.advanceTimersByTime(2000))
  }
}

describe('ListeningPage Review session', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
    // Two weak words, each activated via a miss, so the live Review pool
    // stays non-empty after the first one graduates out below.
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    useProgressStore.getState().recordWordReviewResult('a-ie', false)
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

  it('Play Again captures the Review pool that is current after the completed attempt', () => {
    vi.useFakeTimers()
    const { container, getByRole } = renderReviewListening()

    finishVisibleListeningSession(container)
    // finishVisibleListeningSession always answers correctly, so by the end
    // of the session both words have graduated. Establish the post-attempt
    // weak-word state directly so this regression stays focused on the
    // replay boundary rather than on re-deriving a specific correct/wrong
    // answer sequence.
    useProgressStore.getState().recordWordReviewResult('a-ie', false)
    expect(getByRole('button', { name: /play again/i })).toBeInTheDocument()

    act(() => {
      fireEvent.click(getByRole('button', { name: /play again/i }))
    })

    expect(container.querySelector('p.text-sm')?.textContent).toMatch('Round 1 / 3')
  })
})

describe('ListeningPage word-only Review (Issue #2)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
  })

  it('a wrong answer activates word Review but does NOT touch character Review', () => {
    vi.useFakeTimers()
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row/listening']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/listening" element={<ListeningPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const meaning = container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()
    const targetWord = WORDS_BY_ROW['a-row'].find((w) => w.meaning === meaning)!
    expect(targetWord).toBeDefined()

    const choiceButtons = Array.from(container.querySelectorAll('button')).filter((b) => b.querySelector('.font-kana'))
    const wrongChoice = choiceButtons.find((b) => b.querySelector('.font-kana')?.textContent !== targetWord.kana)!
    expect(wrongChoice).toBeDefined()

    act(() => fireEvent.click(wrongChoice))

    const words = useProgressStore.getState().words
    const characters = useProgressStore.getState().characters
    expect(words[targetWord.id]).toMatchObject({ reviewActive: true, reviewStreak: 0 })
    expect(Object.values(characters).every((c) => !c.reviewActive)).toBe(true)
  })
})

describe('ListeningPage Recommended Path completion (Issue #11)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('completing a normal session marks listening completed, regardless of accuracy', () => {
    vi.useFakeTimers()
    const { container } = renderRowListening()
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'listening')).toBe(false)
    for (let round = 0; round < 8; round++) clickThroughListeningRound(container)
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'listening')).toBe(true)
  })

  it('merely opening the game does not mark completion', () => {
    renderRowListening()
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'listening')).toBe(false)
  })

  it('answering only part of a session does not mark completion', () => {
    vi.useFakeTimers()
    const { container } = renderRowListening()
    clickThroughListeningRound(container)
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'listening')).toBe(false)
  })

  it('a Review-scoped session completing does not mark normal-row completion', () => {
    vi.useFakeTimers()
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/review/listening']}>
        <Routes>
          <Route path="/practice/review/listening" element={<ListeningPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )
    let guard = 0
    while (!container.textContent?.includes('complete!') && guard < 20) {
      clickThroughListeningRound(container)
      guard += 1
    }
    expect(container.textContent).toMatch(/complete!/)
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'listening')).toBe(false)
  })

  it('the normal summary offers Continue to Word Builder', () => {
    vi.useFakeTimers()
    const { container, getByRole } = renderRowListening()
    for (let round = 0; round < 8; round++) clickThroughListeningRound(container)
    const continueLink = getByRole('link', { name: /continue/i })
    expect(continueLink).toHaveAttribute('href', '/practice/hiragana/a-row/word-builder')
  })
})

describe('ListeningPage romaji hint (Issue #19)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides the target romaji at question start when alwaysShowRomajiHints is OFF', () => {
    const { container, queryByText } = renderRowListening()
    const meaning = container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()
    expect(queryByText(MEANING_TO_ROMAJI[meaning])).toBeNull()
    expect(queryByText('Show romaji')).not.toBeNull()
  })

  it('"Show romaji" reveals the current question\'s target romaji', () => {
    const { container, getByText, queryByText } = renderRowListening()
    const meaning = container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()
    act(() => fireEvent.click(getByText('Show romaji')))
    expect(queryByText(MEANING_TO_ROMAJI[meaning])).not.toBeNull()
    expect(queryByText('Show romaji')).toBeNull()
  })

  it('resets the hint on the next question', () => {
    vi.useFakeTimers()
    const { container, getByText, queryByText } = renderRowListening()
    act(() => fireEvent.click(getByText('Show romaji')))
    expect(queryByText('Show romaji')).toBeNull()

    clickThroughListeningRound(container)

    expect(queryByText('Show romaji')).not.toBeNull()
  })

  it('shows the target romaji from the start when alwaysShowRomajiHints is ON, with no "Show romaji" button', () => {
    useProgressStore.getState().setAlwaysShowRomajiHints(true)
    const { container, queryByText } = renderRowListening()
    const meaning = container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()
    expect(queryByText(MEANING_TO_ROMAJI[meaning])).not.toBeNull()
    expect(queryByText('Show romaji')).toBeNull()
  })

  it('using the hint does not affect Review state or score', () => {
    const { getByText } = renderRowListening()
    act(() => fireEvent.click(getByText('Show romaji')))
    expect(Object.values(useProgressStore.getState().words).every((w) => !w.reviewActive)).toBe(true)
    expect(Object.values(useProgressStore.getState().characters).every((c) => !c.reviewActive)).toBe(true)
  })

  it('the same hint rule applies to Review-scoped Listening', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    const { container, queryByText } = render(
      <MemoryRouter initialEntries={['/practice/review/listening']}>
        <Routes>
          <Route path="/practice/review/listening" element={<ListeningPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )
    const meaning = container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()
    expect(queryByText(MEANING_TO_ROMAJI[meaning])).toBeNull()
    expect(queryByText('Show romaji')).not.toBeNull()
  })
})

// Regression test for the mobile "Next button flash" bug — see
// KanaQuizPage.test.tsx's identical describe block for the full root-cause
// explanation. ListeningPage had the same stale `selectedId`-vs-new-
// `currentWord.id` comparison; the fix adds `answeredForId`.
describe('ListeningPage — no Next-button flash after a correct answer', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('never renders an actionable Next button across several correct-answer auto-advances in a row', () => {
    vi.useFakeTimers()
    const { container } = renderRowListening()

    for (let round = 0; round < 4; round++) {
      const meaning = container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()
      const targetKana = MEANING_TO_KANA[meaning]
      const correctButton = Array.from(container.querySelectorAll('button')).find(
        (b) => b.querySelector('.font-kana')?.textContent === targetKana,
      ) as HTMLButtonElement
      expect(correctButton).toBeDefined()

      act(() => fireEvent.click(correctButton))
      expect(within(container).queryByRole('button', { name: /^next$/i })).toBeNull()

      act(() => vi.advanceTimersByTime(1000))
      expect(within(container).queryByRole('button', { name: /^next$/i })).toBeNull()

      act(() => vi.advanceTimersByTime(1000))
      // Now on the next round entirely — still no stray Next button.
      expect(within(container).queryByRole('button', { name: /^next$/i })).toBeNull()
    }
  })
})

// Regression test for the SAME-ID-consecutive-rounds variant of the "Next
// button flash" bug — see KanaQuizPage.test.tsx's identical describe block
// for the full root-cause explanation. The original fix keyed staleness off
// `answeredForId === currentWord.id`, which breaks down whenever the same
// word id legitimately occupies two consecutive rounds. The fix replaces
// that with `answeredForRoundIndex === roundIndex`.
//
// The real queue builder (buildWeightedQueue) deliberately never puts the
// same id in two consecutive rounds once more than one distinct id exists
// (see practiceSelection.ts), so this scenario can't be reached through
// normal play on a multi-word row/pool — it only occurs, in production,
// with a degenerate single-word pool (which then also has no distractors
// to answer wrong with). To exercise the actual bug trigger deterministically
// and with real wrong-answer choices available, `buildWeightedQueue` is
// mocked (see queueOverride above) to force a same-id-consecutive queue on
// a normal multi-word row, while the row's full word list still supplies
// real distractor choices.
describe('ListeningPage — no Next-button flash across same-id consecutive rounds', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  afterEach(() => {
    vi.useRealTimers()
    queueOverride.current = undefined
  })

  it('a wrong answer, followed by Next, into a new round with the SAME word id starts clean (not answered, no stray Next button)', () => {
    vi.useFakeTimers()
    const targetId = WORDS_BY_ROW['a-row'][0].id
    queueOverride.current = [targetId, targetId, WORDS_BY_ROW['a-row'][1].id]
    const { container } = renderRowListening()

    const targetKana = WORDS_BY_ROW['a-row'][0].kana

    // Round 1: answer wrong on purpose (any choice whose kana isn't the
    // target's) so the manual Next button is the one under test.
    const wrongButtonRound1 = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.font-kana')?.textContent && b.querySelector('.font-kana')?.textContent !== targetKana,
    ) as HTMLButtonElement
    expect(wrongButtonRound1).toBeDefined()
    act(() => fireEvent.click(wrongButtonRound1))

    // Wrong answer -> Next button IS actionable (regression guard: the
    // round-identity fix must not suppress the legitimate case).
    const nextButton = within(container).getByRole('button', { name: /^next$/i })
    act(() => fireEvent.click(nextButton))

    // Round 2: forced to the SAME word id as round 1. The new round must
    // start genuinely fresh — no leftover actionable Next button carried
    // over, and the choice buttons re-enabled.
    expect(within(container).queryByRole('button', { name: /^next$/i })).toBeNull()
    const round2Buttons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.querySelector('.font-kana'),
    ) as HTMLButtonElement[]
    expect(round2Buttons.every((b) => !b.disabled)).toBe(true)
  })
})
