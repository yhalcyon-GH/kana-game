import { act, fireEvent, render, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORDS_BY_ROW } from '../../data/words'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { useSavedItemsStore } from '../../store/savedItemsStore'
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

// a-row now has 5 words, not 4 (Issue #155 added えん/'yen' alongside ん).
const MEANING_TO_KANA: Record<string, string> = { love: 'あい', house: 'いえ', 'up / above': 'うえ', blue: 'あお', yen: 'えん' }
// a-row now has 5 words, not 4 (Issue #155 added えん/'yen' alongside ん).
const MEANING_TO_ROMAJI: Record<string, string> = { love: 'ai', house: 'ie', 'up / above': 'ue', blue: 'ao', yen: 'en' }

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

// The completed-session summary shows the real played correct/total count
// as a compact "{correct}/{total}" score (see PracticeSummary) instead of a
// computed Accuracy percentage or the old "{total}問中{correct}問正解" text
// — see "fix: redesign practice result summary".
describe('ListeningPage result summary (correct/total count)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Clicks the FIRST choice every round (mode-agnostic) and tallies real
  // correctness from the DOM. Next now renders on BOTH correct and wrong
  // rounds (see AnswerFeedbackRow's showNext), so correctness is read from
  // whether the Save toggle (wrong-only) appears, not from Next's presence.
  function playSessionTallyingCorrectness(container: HTMLElement, rounds: number): number {
    let correct = 0
    for (let round = 0; round < rounds; round++) {
      const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
      act(() => fireEvent.click(buttons[0]))
      const isWrong = !!container.querySelector('input[type="checkbox"]')
      if (!isWrong) correct += 1
      const next = within(container).getByRole('button', { name: /^next$/i })
      act(() => fireEvent.click(next))
    }
    return correct
  }

  it('shows the actual correct count out of the actual played total for a normal 8-question session', () => {
    vi.useFakeTimers()
    const { container } = renderRowListening()
    const correct = playSessionTallyingCorrectness(container, 8)
    expect(container.textContent).toContain(`${correct} of 8 correct`)
    expect(container.textContent).not.toMatch(/問中/)
    expect(container.textContent).not.toMatch(/問正解/)
    expect(container.textContent).not.toMatch(/その調子/)
    expect(container.textContent).not.toMatch(/^Accuracy$/i)
  })

  it('a shorter Review session shows the actual (non-8) played total, not a fixed session length', () => {
    vi.useFakeTimers()
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    const { container } = renderReviewListening()

    let guard = 0
    let correct = 0
    while (!container.textContent?.includes('complete!') && guard < 20) {
      const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
      act(() => fireEvent.click(buttons[0]))
      const isWrong = !!container.querySelector('input[type="checkbox"]')
      if (!isWrong) correct += 1
      const next = within(container).queryByRole('button', { name: /^next$/i })
      if (next) act(() => fireEvent.click(next))
      guard += 1
    }

    expect(container.textContent).toMatch(/complete!/)
    expect(container.textContent).toMatch(new RegExp(`${correct} of \\d+ correct`))
    expect(container.textContent).not.toMatch(/ of 8 correct/)
  })
})

describe('ListeningPage romaji hint (Issue #19)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Below the target's own meaning label, this checks the ABOVE-the-choices
  // romaji hint (the `alwaysShowRomajiHints` line under the word image) —
  // not the per-choice romaji reserved under each answer button (see the
  // "reserves a romaji line per choice" describe block below), which is a
  // separate slot that toggles visibility (not presence) once answered.
  it('hides the target romaji at question start when alwaysShowRomajiHints is OFF, with no reveal button', () => {
    const { container, queryByText } = renderRowListening()
    const meaning = container.querySelector('span.text-sm.text-neutral-500:not(.block)')!.textContent!.trim()
    expect(queryByText(MEANING_TO_ROMAJI[meaning], { selector: 'span:not(.block)' })).toBeNull()
    expect(queryByText('Show romaji')).toBeNull()
  })

  it('shows the target romaji from the start when alwaysShowRomajiHints is ON, with no "Show romaji" button', () => {
    useProgressStore.getState().setAlwaysShowRomajiHints(true)
    const { container, queryByText } = renderRowListening()
    const meaning = container.querySelector('span.text-sm.text-neutral-500:not(.block)')!.textContent!.trim()
    expect(queryByText(MEANING_TO_ROMAJI[meaning], { selector: 'span:not(.block)' })).not.toBeNull()
    expect(queryByText('Show romaji')).toBeNull()
  })

  it('the same rule applies to Review-scoped Listening', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    const { container, queryByText } = render(
      <MemoryRouter initialEntries={['/practice/review/listening']}>
        <Routes>
          <Route path="/practice/review/listening" element={<ListeningPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )
    const meaning = container.querySelector('span.text-sm.text-neutral-500:not(.block)')!.textContent!.trim()
    expect(queryByText(MEANING_TO_ROMAJI[meaning], { selector: 'span:not(.block)' })).toBeNull()
    expect(queryByText('Show romaji')).toBeNull()
  })
})

// The per-choice romaji line (shown under each answer button once answered)
// reserves its line height up front — see AnswerFeedbackRow-adjacent layout-
// shift fix — instead of being inserted only after answering. It stays
// present but visually hidden (`invisible` + `aria-hidden`) before an
// answer, then becomes visible after, without ever being added/removed from
// the DOM (which is what would move the mascot stage below it).
describe('ListeningPage per-choice romaji slot (no layout shift)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  it('reserves a romaji line per choice before answering (present but hidden), then reveals it after', () => {
    const { container } = renderRowListening()
    const choiceButtons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const romajiSlots = () =>
      choiceButtons.map((b) => b.querySelector('span.block.text-sm.font-normal')) as (HTMLElement | null)[]

    const before = romajiSlots()
    expect(before.every((s) => s !== null)).toBe(true)
    expect(before.every((s) => s!.classList.contains('invisible'))).toBe(true)
    expect(before.every((s) => s!.getAttribute('aria-hidden') === 'true')).toBe(true)

    act(() => fireEvent.click(choiceButtons[0]))

    const after = romajiSlots()
    expect(after.every((s) => s!.classList.contains('visible'))).toBe(true)
    expect(after.every((s) => s!.getAttribute('aria-hidden') === 'false')).toBe(true)
    // Same slots, not new ones — structure unchanged by the toggle.
    expect(after.map((s) => s)).toEqual(romajiSlots())
  })
})

// Regression test, updated for the new "Next shown on correct too" behavior
// (see AnswerFeedbackRow's showNext) — see KanaQuizPage.test.tsx's identical
// describe block for the original stale `selectedId`-vs-new-`currentWord.id`
// root cause this guards against. Next now legitimately appears right after
// a correct answer (in addition to the still-running 2s auto-advance timer)
// and must cleanly disappear once the round actually transitions — it must
// never carry over stale/duplicated into a round that hasn't been answered
// yet.
describe('ListeningPage — no stale Next-button carryover after a correct answer', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows exactly one Next button right after a correct answer, and none in the fresh unanswered round that follows', () => {
    vi.useFakeTimers()
    const { container } = renderRowListening()

    for (let round = 0; round < 4; round++) {
      const meaning = container.querySelector('span.text-sm.text-neutral-500:not(.block)')!.textContent!.trim()
      const targetKana = MEANING_TO_KANA[meaning]
      const correctButton = Array.from(container.querySelectorAll('button')).find(
        (b) => b.querySelector('.font-kana')?.textContent === targetKana,
      ) as HTMLButtonElement
      expect(correctButton).toBeDefined()

      // Not yet answered this round — no Next button.
      expect(within(container).queryByRole('button', { name: /^next$/i })).toBeNull()

      act(() => fireEvent.click(correctButton))
      // Answered correctly — Next appears immediately, alongside the still-
      // pending auto-advance timer, and there's exactly one of it.
      expect(within(container).getAllByRole('button', { name: /^next$/i })).toHaveLength(1)

      act(() => vi.advanceTimersByTime(1000))
      expect(within(container).getAllByRole('button', { name: /^next$/i })).toHaveLength(1)

      // Auto-advance timer fires here, moving into a brand-new unanswered
      // round — the Next button must not carry over.
      act(() => vi.advanceTimersByTime(1000))
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

// Pre-answer mascot state (see "fix: show thinking mascot before
// answering") — before the learner picks a choice, Tamamizu shows the
// "thinking" artwork (mood 'normal' -> mascot/normal.webp); after
// answering, the existing correct/incorrect reaction still takes over.
describe('ListeningPage pre-answer mascot', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the thinking mascot (mascot/normal.webp) before the learner answers', () => {
    const { container } = renderRowListening()
    const mascotImg = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotImg).not.toBeNull()
    expect(mascotImg.src).toContain('mascot/normal.webp')
  })

  it('switches to a reaction mascot after answering, and back to normal on the next round', () => {
    vi.useFakeTimers()
    const { container } = renderRowListening()
    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    act(() => fireEvent.click(buttons[0]))

    const mascotAfterAnswer = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotAfterAnswer.src).not.toContain('mascot/normal.webp')

    const next = within(container).queryByRole('button', { name: /^next$/i })
    if (next) {
      act(() => fireEvent.click(next))
    } else {
      act(() => vi.advanceTimersByTime(2000))
    }
    const mascotNextRound = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotNextRound.src).toContain('mascot/normal.webp')
  })
})

// Yōon word choices must never allow a bad line break like 「き」「ゃ」 —
// see "fix: polish section labels and similar-letter support". Each choice's
// kana is rendered via UnbreakableKana, which keeps every yōon glyph pair in
// its own single non-breaking span.
describe('ListeningPage yōon choice rendering (no bad line breaks)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  function renderYouonListening() {
    return render(
      <MemoryRouter initialEntries={['/practice/youon/youon-ka-row/listening']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/listening" element={<ListeningPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('never renders a bare (non-nowrap) yōon glyph pair in a choice button', () => {
    const { container } = renderYouonListening()
    const smallKana = /[ゃゅょャュョ]/
    for (const kanaSpan of Array.from(container.querySelectorAll('.font-kana'))) {
      // Every direct child must be a nowrap span (from UnbreakableKana) —
      // no raw text node containing a small ゃ/ゅ/ょ sits directly in the
      // kana span unprotected.
      for (const child of Array.from(kanaSpan.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          expect(child.textContent).not.toMatch(smallKana)
        }
      }
      for (const moraSpan of Array.from(kanaSpan.querySelectorAll('span'))) {
        expect(moraSpan).toHaveClass('whitespace-nowrap')
      }
    }
  })
})

// Saved items (see savedItemsStore.ts) — Listening shows a Save checkbox
// for the missed target word only after a wrong answer, never on a correct
// one.
describe('ListeningPage: Save checkbox on wrong answer only', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useSavedItemsStore.setState({ savedCharacterIds: [], savedWordIds: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show a Save checkbox before answering', () => {
    const { queryByRole } = renderRowListening()
    expect(queryByRole('checkbox')).toBeNull()
  })

  it('shows a Save checkbox for the target word after a wrong answer, and saving it updates savedItemsStore', () => {
    vi.useFakeTimers()
    const { container, getByRole } = renderRowListening()
    const meaning = container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()
    const targetKana = MEANING_TO_KANA[meaning]
    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const wrongButton = buttons.find((b) => b.querySelector('.font-kana')?.textContent !== targetKana)!
    act(() => fireEvent.click(wrongButton))

    const checkbox = getByRole('checkbox') as HTMLInputElement
    expect(checkbox).not.toBeChecked()
    act(() => fireEvent.click(checkbox))
    expect(checkbox).toBeChecked()
    expect(useSavedItemsStore.getState().savedWordIds.length).toBe(1)
  })

  it('does not show a Save checkbox after a correct answer', () => {
    vi.useFakeTimers()
    const { container, queryByRole } = renderRowListening()
    const meaning = container.querySelector('span.text-sm.text-neutral-500')!.textContent!.trim()
    const targetKana = MEANING_TO_KANA[meaning]
    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const correctButton = buttons.find((b) => b.querySelector('.font-kana')?.textContent === targetKana)!
    act(() => fireEvent.click(correctButton))

    expect(queryByRole('checkbox')).toBeNull()
  })
})
