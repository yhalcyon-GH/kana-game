import { act, fireEvent, render, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { KanaQuizPage } from './KanaQuizPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

function renderRowQuiz() {
  return render(
    <MemoryRouter initialEntries={['/practice/hiragana/a-row/kana-quiz']}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId/kana-quiz" element={<KanaQuizPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderReviewQuiz() {
  return render(
    <MemoryRouter initialEntries={['/practice/review/kana-quiz']}>
      <Routes>
        <Route path="/practice/review/kana-quiz" element={<KanaQuizPage rowIdOverride={REVIEW_SCOPE_ID} />} />
      </Routes>
    </MemoryRouter>,
  )
}

function currentRoundMode(container: HTMLElement): 'read' | 'recall' {
  return container.querySelector('.font-kana.text-7xl') ? 'read' : 'recall'
}

// Clicks any choice for the round currently showing, then clears it —
// either via the manual "Next" button (a wrong answer) or by waiting out
// the correct-answer auto-advance delay. Requires fake timers. Used by
// tests that only care about session-level structure (mode mix, length,
// Play again), not about answering correctly.
function clickThroughRound(container: HTMLElement) {
  const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
  act(() => fireEvent.click(buttons[0]))
  const next = within(container).queryByRole('button', { name: /next/i })
  if (next) {
    act(() => fireEvent.click(next))
  } else {
    act(() => vi.advanceTimersByTime(2000))
  }
}

function collectModesForOneSession(container: HTMLElement, count = 8): ('read' | 'recall')[] {
  const modes: ('read' | 'recall')[] = []
  for (let round = 0; round < count; round++) {
    modes.push(currentRoundMode(container))
    clickThroughRound(container)
  }
  return modes
}

// Auto-completes rounds (mode-agnostic, via clickThroughRound) until the
// CURRENT round matches `mode` — since round order is shuffled, a specific
// mode isn't guaranteed to appear first. Used by tests that need to
// exercise one mode's specific behavior deterministically.
function advanceUntilMode(container: HTMLElement, mode: 'read' | 'recall') {
  let guard = 0
  while (currentRoundMode(container) !== mode) {
    clickThroughRound(container)
    guard += 1
    if (guard > 8) throw new Error(`never reached a ${mode} round within one session`)
  }
}

// Pre-answer mascot state (see "fix: show thinking mascot before
// answering") — before the learner picks a choice, Tamamizu shows the
// "thinking" artwork (mood 'normal' -> mascot/normal.webp); after
// answering, the existing correct/incorrect reaction still takes over.
describe('KanaQuizPage pre-answer mascot', () => {
  it('shows the thinking mascot (mascot/normal.webp) before the learner answers', () => {
    const { container } = renderRowQuiz()
    const mascotImg = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotImg).not.toBeNull()
    expect(mascotImg.src).toContain('mascot/normal.webp')
  })

  it('switches to the incorrect mascot after a wrong answer, and back to normal on the next round', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()
    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const kanaEl = container.querySelector('.font-kana.text-7xl')
    let clicked: HTMLButtonElement
    if (kanaEl) {
      const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
      const label = CHARACTERS_BY_ID[targetId].displayLabel ?? CHARACTERS_BY_ID[targetId].romaji
      clicked = buttons.find((b) => b.textContent !== label)!
    } else {
      clicked = buttons[0]
    }
    act(() => fireEvent.click(clicked))

    const mascotAfterAnswer = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    // Either a wrong click (incorrect.webp) or, by chance, a correct one
    // (correct.webp/streak.webp) — either way it must have left 'normal'.
    expect(mascotAfterAnswer.src).not.toContain('mascot/normal.webp')

    const next = within(container).queryByRole('button', { name: /^next$/i })
    if (next) {
      act(() => fireEvent.click(next))
    } else {
      act(() => vi.advanceTimersByTime(2000))
    }
    const mascotNextRound = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotNextRound.src).toContain('mascot/normal.webp')
    vi.useRealTimers()
  })
})

describe('KanaQuizPage starts directly, no mode selector', () => {
  it('opening Kana Quiz shows a question immediately, with no Read/Recall selector', () => {
    const { container, queryByText } = renderRowQuiz()
    expect(queryByText('Read')).toBeNull()
    expect(queryByText('Recall')).toBeNull()
    expect(container.querySelector('.grid button')).not.toBeNull()
  })
})

describe('KanaQuizPage mixed session composition', () => {
  it('every normal 8-question session contains exactly 4 Read and 4 Recall rounds', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()
    const modes = collectModesForOneSession(container)
    expect(modes.filter((m) => m === 'read')).toHaveLength(4)
    expect(modes.filter((m) => m === 'recall')).toHaveLength(4)
    vi.useRealTimers()
  })

  it('the mode order is shuffled, not fixed', () => {
    vi.useFakeTimers()
    const orders = new Set<string>()
    for (let i = 0; i < 8; i++) {
      const { container, unmount } = renderRowQuiz()
      orders.add(collectModesForOneSession(container).join(','))
      unmount()
    }
    expect(orders.size).toBeGreaterThan(1)
    vi.useRealTimers()
  })

  it('Play again creates another valid 4+4 mixed session', () => {
    vi.useFakeTimers()
    const { container, getByRole } = renderRowQuiz()
    collectModesForOneSession(container)
    expect(getByRole('button', { name: /play again/i })).toBeInTheDocument()

    act(() => fireEvent.click(getByRole('button', { name: /play again/i })))
    const secondModes = collectModesForOneSession(container)
    expect(secondModes.filter((m) => m === 'read')).toHaveLength(4)
    expect(secondModes.filter((m) => m === 'recall')).toHaveLength(4)
    vi.useRealTimers()
  })

  it('no longer offers a Switch mode action on the summary', () => {
    vi.useFakeTimers()
    const { container, queryByRole } = renderRowQuiz()
    collectModesForOneSession(container)
    expect(queryByRole('button', { name: /switch mode/i })).toBeNull()
    vi.useRealTimers()
  })
})

describe('KanaQuizPage Read round behavior', () => {
  let playSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  })

  afterEach(() => {
    playSpy.mockRestore()
    vi.useRealTimers()
  })

  it('shows the kana prompt, romaji choices, and never plays audio or shows a replay button', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()
    advanceUntilMode(container, 'read')

    expect(container.querySelector('.font-kana.text-7xl')).not.toBeNull()
    expect(container.querySelector('[aria-label="Replay audio"]')).toBeNull()

    const choiceButtons = Array.from(container.querySelectorAll('.grid button'))
    for (const button of choiceButtons) {
      expect(button.querySelector('.font-kana')).toBeNull()
    }

    const kanaEl = container.querySelector('.font-kana.text-7xl')!
    const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
    // advanceUntilMode may have passed through real Recall rounds first,
    // each legitimately playing character audio — only calls made AFTER
    // reaching this Read round are relevant here.
    const instancesBeforeAnswer = playSpy.mock.instances.length
    act(() => fireEvent.click(choiceButtons[0] as HTMLButtonElement))

    for (const call of playSpy.mock.instances.slice(instancesBeforeAnswer) as HTMLAudioElement[]) {
      expect(call.src).not.toMatch(/\/audio\/characters\//)
    }
    expect(container.querySelector('[aria-label="Replay audio"]')).toBeNull()
    expect(useProgressStore.getState().characters[targetId]).toBeDefined()
  })
})

describe('KanaQuizPage Recall round behavior', () => {
  let playSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  })

  afterEach(() => {
    playSpy.mockRestore()
    vi.useRealTimers()
  })

  it('auto-plays the target pronunciation, hides the kana, offers kana choices, and reveals the label after answering', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()
    advanceUntilMode(container, 'recall')

    const instancesBefore = playSpy.mock.instances.length
    expect(instancesBefore).toBeGreaterThan(0)
    expect(container.querySelector('.font-kana.text-7xl')).toBeNull()
    expect(container.querySelector('[aria-label="Replay audio"]')).not.toBeNull()

    // Issue #19: the target romaji stays hidden until answered, same as the
    // kana itself — Recall's only prompt is the audio.
    const romajiValuesBeforeAnswer = Object.values(CHARACTERS_BY_ID).map((c) => c.displayLabel ?? c.romaji)
    expect(
      Array.from(container.querySelectorAll('span')).some((el) => romajiValuesBeforeAnswer.includes(el.textContent ?? '')),
    ).toBe(false)

    const choiceButtons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    expect(choiceButtons.length).toBeGreaterThan(0)
    for (const button of choiceButtons) {
      expect(button.querySelector('.font-kana')).not.toBeNull()
    }

    act(() => fireEvent.click(choiceButtons[0]))

    const romajiValues = Object.values(CHARACTERS_BY_ID).map((c) => c.displayLabel ?? c.romaji)
    const revealed = Array.from(container.querySelectorAll('span')).some((el) => romajiValues.includes(el.textContent ?? ''))
    expect(revealed).toBe(true)
    expect(container.querySelector('[aria-label="Replay audio"]')).not.toBeNull()
  })
})

describe('KanaQuizPage character Review streak (both directions)', () => {
  it('Read: a wrong answer activates character Review for the target character at 0/2', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()
    advanceUntilMode(container, 'read')

    const kanaEl = container.querySelector('.font-kana.text-7xl')!
    const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const target = CHARACTERS_BY_ID[targetId]
    const wrongButton = buttons.find((b) => b.textContent !== (target.displayLabel ?? target.romaji))!

    act(() => fireEvent.click(wrongButton))

    expect(useProgressStore.getState().characters[targetId]).toMatchObject({ reviewActive: true, reviewStreak: 0 })
    vi.useRealTimers()
  })

  it('Recall: a wrong answer activates character Review for the target character at 0/2', () => {
    vi.useFakeTimers()
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container } = renderRowQuiz()
    advanceUntilMode(container, 'recall')

    // The most recent play() call at this point is this round's own
    // round-start autoplay — its .src encodes "characters/<id>.wav",
    // identifying the target deterministically without guessing.
    const promptAudio = playSpy.mock.instances[playSpy.mock.instances.length - 1] as HTMLAudioElement
    const match = promptAudio.src.match(/\/audio\/characters\/([^/]+)\.wav$/)
    expect(match).not.toBeNull()
    const targetId = match![1]
    const targetKana = CHARACTERS_BY_ID[targetId].kana

    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const wrongButton = buttons.find((b) => b.textContent !== targetKana)!

    act(() => fireEvent.click(wrongButton))

    expect(useProgressStore.getState().characters[targetId]).toMatchObject({ reviewActive: true, reviewStreak: 0 })

    playSpy.mockRestore()
    vi.useRealTimers()
  })
})

describe('KanaQuizPage mistake replay', () => {
  it('still works and uses a balanced mixed-mode order for the replay length', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()

    // Miss exactly the first round; answer the rest via clickThroughRound
    // (correct or wrong doesn't matter for what this test verifies).
    const mode = currentRoundMode(container)
    const buttons0 = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    if (mode === 'read') {
      const kanaEl = container.querySelector('.font-kana.text-7xl')!
      const missedId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
      const target = CHARACTERS_BY_ID[missedId]
      const wrongButton = buttons0.find((b) => b.textContent !== (target.displayLabel ?? target.romaji))!
      act(() => fireEvent.click(wrongButton))
    } else {
      act(() => fireEvent.click(buttons0[0]))
    }
    const next0 = within(container).queryByRole('button', { name: /next/i })
    if (next0) act(() => fireEvent.click(next0))
    else act(() => vi.advanceTimersByTime(2000))

    for (let round = 1; round < 8; round++) {
      clickThroughRound(container)
    }

    const mistakeButton = within(container).queryByRole('button', { name: /^retry$/i })
    expect(mistakeButton).not.toBeNull()
    act(() => fireEvent.click(mistakeButton!))

    // Whatever the replay length is (at least 1), it must still be
    // buildQuizModePlan-balanced (verified at the unit level in
    // quizModePlan.test.ts) and genuinely playable here.
    expect(container.querySelector('.grid button')).not.toBeNull()
    vi.useRealTimers()
  })
})

describe('KanaQuizPage Review scope', () => {
  it('shows a success state instead of a blank page when nothing is active in character Review', () => {
    useProgressStore.getState().markRowTaught('a-row')
    const { container } = renderReviewQuiz()
    expect(container.textContent).toMatch(/Review complete!/)
    expect(container.querySelector('.font-kana')).toBeNull()
  })

  it('uses the same mixed 4+4 behavior once characters are active in Review', () => {
    vi.useFakeTimers()
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    useProgressStore.getState().recordCharacterReviewResult('i', false)
    useProgressStore.getState().recordCharacterReviewResult('u', false)
    useProgressStore.getState().recordCharacterReviewResult('e', false)
    useProgressStore.getState().recordCharacterReviewResult('o', false)

    const { container, queryByText } = renderReviewQuiz()
    expect(queryByText('Read')).toBeNull()
    expect(queryByText('Recall')).toBeNull()
    const modes = collectModesForOneSession(container)
    expect(modes.filter((m) => m === 'read')).toHaveLength(4)
    expect(modes.filter((m) => m === 'recall')).toHaveLength(4)
    vi.useRealTimers()
  })
})

describe('KanaQuizPage Recommended Path completion (Issue #11)', () => {
  it('completing a normal session marks kanaQuiz completed for the row, and does not gate on accuracy', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'kanaQuiz')).toBe(false)
    collectModesForOneSession(container) // answers are whatever clickThroughRound resolves them to
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'kanaQuiz')).toBe(true)
    vi.useRealTimers()
  })

  it('merely opening the game does not mark completion', () => {
    renderRowQuiz()
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'kanaQuiz')).toBe(false)
  })

  it('answering only part of a session does not mark completion', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()
    clickThroughRound(container)
    clickThroughRound(container)
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'kanaQuiz')).toBe(false)
    vi.useRealTimers()
  })

  it('a Review-scoped session completing does not mark normal-row completion', () => {
    vi.useFakeTimers()
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    const { container } = renderReviewQuiz()
    // Only one weak character -> a short (non-8-question) session; drive it
    // to its own real completion regardless of exact length.
    let guard = 0
    while (!container.textContent?.includes('complete!') && guard < 20) {
      clickThroughRound(container)
      guard += 1
    }
    expect(container.textContent).toMatch(/complete!/)
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'kanaQuiz')).toBe(false)
    vi.useRealTimers()
  })

  it('the normal summary offers Continue to Listening', () => {
    vi.useFakeTimers()
    const { container, getByRole } = renderRowQuiz()
    collectModesForOneSession(container)
    const continueLink = getByRole('link', { name: /continue/i })
    expect(continueLink).toHaveAttribute('href', '/practice/hiragana/a-row/listening')
    vi.useRealTimers()
  })
})

// The completed-session summary shows the real played correct/total count
// (see PracticeSummary's "{total}問中{correct}問正解") instead of a computed
// Accuracy percentage — see "fix: improve practice result summary".
describe('KanaQuizPage result summary (correct/total count)', () => {
  // Clicks the FIRST choice every round (mode-agnostic) and tallies real
  // correctness from the DOM: a correct answer never shows an actionable
  // Next button (it auto-advances after 2000ms — see the "Next button
  // flash" regression tests above), a wrong one does. This gives a ground
  // truth correct count without needing to know the target answer.
  function playSessionTallyingCorrectness(container: HTMLElement, rounds: number): number {
    let correct = 0
    for (let round = 0; round < rounds; round++) {
      const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
      act(() => fireEvent.click(buttons[0]))
      const next = within(container).queryByRole('button', { name: /^next$/i })
      if (next === null) {
        correct += 1
        act(() => vi.advanceTimersByTime(2000))
      } else {
        act(() => fireEvent.click(next))
      }
    }
    return correct
  }

  it('shows the actual correct count out of the actual played total for a normal 8-question session', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()
    const correct = playSessionTallyingCorrectness(container, 8)
    expect(container.textContent).toContain(`8問中${correct}問正解`)
    expect(container.textContent).not.toMatch(/Accuracy/i)
    expect(container.textContent).not.toMatch(/%/)
    vi.useRealTimers()
  })

  it('a shorter Review session shows the actual (non-8) played total, not a fixed session length', () => {
    vi.useFakeTimers()
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    const { container } = renderReviewQuiz()

    let guard = 0
    let correct = 0
    while (!container.textContent?.includes('complete!') && guard < 20) {
      const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
      act(() => fireEvent.click(buttons[0]))
      const next = within(container).queryByRole('button', { name: /^next$/i })
      if (next) {
        act(() => fireEvent.click(next))
      } else {
        correct += 1
        act(() => vi.advanceTimersByTime(2000))
      }
      guard += 1
    }

    expect(container.textContent).toMatch(/complete!/)
    // Only one weak character was queued — the real played total must be
    // small, and must appear verbatim rather than a hardcoded 8.
    expect(container.textContent).toMatch(new RegExp(`\\d問中${correct}問正解`))
    expect(container.textContent).not.toMatch(/8問中/)
    vi.useRealTimers()
  })
})

// Regression test for the mobile "Next button flash" bug (see PR
// description): answering CORRECTLY schedules a 2000ms auto-advance and
// must never render an actionable "Next" button at all — before, during,
// or across the round transition it triggers. The underlying bug was that
// `answered`/`selectedId` are round-local state that used to only get
// reset by a per-round effect keyed on the new round's id — so for the one
// render where roundIndex has already advanced but that reset effect
// hasn't run yet, the OLD `selectedId` no longer equals the NEW
// currentCharId, and the "Next" button's condition (`answered &&
// selectedId !== currentCharId`) would spuriously read true. The fix adds
// `answeredForId`, set alongside `answered`, so the button only ever shows
// when the answered state genuinely belongs to the round currently on
// screen.
describe('KanaQuizPage — no Next-button flash after a correct answer', () => {
  it('never renders an actionable Next button across several correct-answer auto-advances in a row', () => {
    vi.useFakeTimers()
    const { container } = renderRowQuiz()

    for (let round = 0; round < 6; round++) {
      const isRead = currentRoundMode(container) === 'read'
      let correctButton: HTMLButtonElement
      if (isRead) {
        const kanaEl = container.querySelector('.font-kana.text-7xl')!
        const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
        const label = CHARACTERS_BY_ID[targetId].displayLabel ?? CHARACTERS_BY_ID[targetId].romaji
        correctButton = Array.from(container.querySelectorAll('.grid button')).find(
          (b) => b.textContent === label,
        ) as HTMLButtonElement
      } else {
        // Recall: the target's kana isn't shown as a prompt, but the
        // correct choice button is the one whose eventual green result
        // state — determine it via the store's live audio target isn't
        // exposed, so instead just answer with the FIRST choice and
        // detect whether it was correct from the DOM after clicking; if
        // wrong, immediately move past it with the resulting Next button
        // (correctness itself is asserted by other tests) — this loop
        // only cares that no button renders as "Next" during any correct
        // auto-advance window.
        correctButton = Array.from(container.querySelectorAll('.grid button'))[0] as HTMLButtonElement
      }

      act(() => fireEvent.click(correctButton))
      // Immediately after answering, and at every point while the
      // 2000ms auto-advance timer is pending, there must be no
      // interactive Next button if the answer was correct.
      const nextRightAfterAnswer = within(container).queryByRole('button', { name: /^next$/i })
      const wasCorrect = nextRightAfterAnswer === null
      if (wasCorrect) {
        act(() => vi.advanceTimersByTime(1000))
        expect(within(container).queryByRole('button', { name: /^next$/i })).toBeNull()
        act(() => vi.advanceTimersByTime(1000))
        // Now on the next round entirely — still no stray Next button.
        expect(within(container).queryByRole('button', { name: /^next$/i })).toBeNull()
      } else {
        // A genuinely wrong answer's Next button IS actionable — clear it
        // manually and move on, same as every other test in this file.
        act(() => fireEvent.click(nextRightAfterAnswer!))
      }
    }
    vi.useRealTimers()
  })
})

// Regression test for the SAME-ID-consecutive-rounds variant of the "Next
// button flash" bug: the original fix keyed staleness off `answeredForId
// === currentCharId`, which breaks down whenever the same character id
// legitimately occupies two consecutive rounds (a small pool, e.g. Review
// with exactly one weak character) — `answeredForId` stays equal to the
// (unchanged) `currentCharId` straight through the round transition, so the
// stale Next button can flash again. The fix replaces that with
// `answeredForRoundIndex === roundIndex`, a genuine per-round identity that
// changes every round regardless of which character occupies it. Review
// with a single weak character ('a') is used here specifically because it
// deterministically repeats the same target id every round (see the
// existing "Review scope" describe block above for the same setup), rather
// than relying on random queue luck.
describe('KanaQuizPage — no Next-button flash across same-id consecutive rounds', () => {
  it('a wrong answer, followed by Next, into a new round with the SAME character id starts clean (not answered, no stray Next button)', () => {
    vi.useFakeTimers()
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)
    const { container } = renderReviewQuiz()

    // Round 1: answer wrong on purpose (any non-target choice) so the
    // character stays weak and the review queue keeps re-targeting 'a'.
    const wrongButtonRound1 = Array.from(container.querySelectorAll('.grid button')).find(
      (b) => b.textContent !== (CHARACTERS_BY_ID['a'].displayLabel ?? CHARACTERS_BY_ID['a'].romaji) && b.textContent !== 'あ',
    ) as HTMLButtonElement
    act(() => fireEvent.click(wrongButtonRound1))

    // Wrong answer -> Next button IS actionable (regression guard: the
    // round-identity fix must not suppress the legitimate case).
    const nextButton = within(container).getByRole('button', { name: /^next$/i })
    act(() => fireEvent.click(nextButton))

    // Round 2: same character id ('a' is the only weak character). The new
    // round must start in a genuinely fresh "not answered" state — no
    // leftover actionable Next button carried over from round 1, and the
    // choice buttons must be re-enabled (not stuck disabled from the
    // previous round's `answered=true`).
    expect(within(container).queryByRole('button', { name: /^next$/i })).toBeNull()
    const round2Buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    expect(round2Buttons.every((b) => !b.disabled)).toBe(true)

    vi.useRealTimers()
  })
})
