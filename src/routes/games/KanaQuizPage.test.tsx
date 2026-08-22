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

    const mistakeButton = within(container).queryByRole('button', { name: /review \d+ mistake/i })
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
