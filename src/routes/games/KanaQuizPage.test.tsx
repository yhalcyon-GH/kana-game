import { act, fireEvent, render } from '@testing-library/react'
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

function selectMode(container: HTMLElement, label: 'Read' | 'Recall') {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.querySelector('span')?.textContent === label)!
  act(() => fireEvent.click(button))
}

describe('KanaQuizPage mode selector', () => {
  it('shows Read and Recall choices before a session begins', () => {
    const { container, getByText } = renderRowQuiz()
    expect(getByText('Read')).toBeInTheDocument()
    expect(getByText('Recall')).toBeInTheDocument()
    // No game UI (round header, choices) until a mode is picked.
    expect(container.querySelector('.grid')).toBeNull()
  })

  it('Back to hub works from the selector', () => {
    const { getByText } = renderRowQuiz()
    const link = getByText('Back to hub').closest('a')!
    expect(link.getAttribute('href')).toBe('/practice/hiragana/a-row')
  })

  it('selecting Read starts Read mode (kana shown, no replay button yet)', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Read')
    expect(container.querySelector('.font-kana.text-7xl')).not.toBeNull()
    expect(container.querySelector('[aria-label="Replay audio"]')).toBeNull()
  })

  it('selecting Recall starts Recall mode (kana hidden, replay button available)', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Recall')
    expect(container.querySelector('.font-kana.text-7xl')).toBeNull()
    expect(container.querySelector('[aria-label="Replay audio"]')).not.toBeNull()
  })
})

describe('KanaQuizPage Read mode', () => {
  let playSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  })

  afterEach(() => {
    playSpy.mockRestore()
  })

  it('does not auto-play the target pronunciation before answering, and shows no replay button', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Read')
    expect(playSpy).not.toHaveBeenCalled()
    expect(container.querySelector('[aria-label="Replay audio"]')).toBeNull()
  })

  it('choices display romaji, not kana glyphs', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Read')
    const choiceButtons = Array.from(container.querySelectorAll('.grid button'))
    expect(choiceButtons.length).toBeGreaterThan(0)
    for (const button of choiceButtons) {
      expect(button.querySelector('.font-kana')).toBeNull()
    }
  })

  it('never plays the target pronunciation or shows a replay button, before or after answering', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Read')

    const kanaEl = container.querySelector('.font-kana.text-7xl')!
    const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
    const choiceButtons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]

    act(() => fireEvent.click(choiceButtons[0]))

    // Only the mascot's correct/incorrect feedback voice may have played
    // (see AnswerFeedbackRow/useAnswerFeedback) — never the character's own
    // pronunciation clip, and no replay button ever appears in Read mode.
    for (const call of playSpy.mock.instances as HTMLAudioElement[]) {
      expect(call.src).not.toMatch(/\/audio\/characters\//)
    }
    expect(container.querySelector('[aria-label="Replay audio"]')).toBeNull()
    expect(useProgressStore.getState().characters[targetId]).toBeDefined()
  })
})

describe('KanaQuizPage Recall mode', () => {
  let playSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  })

  afterEach(() => {
    playSpy.mockRestore()
  })

  it('auto-plays the target pronunciation at round start, before any answer', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Recall')
    expect(playSpy).toHaveBeenCalledTimes(1)
  })

  it('does not show the target kana as the prompt before answering, and offers a replay button', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Recall')
    expect(container.querySelector('.font-kana.text-7xl')).toBeNull()
    expect(container.querySelector('[aria-label="Replay audio"]')).not.toBeNull()
  })

  it('choices are kana glyphs', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Recall')
    const choiceButtons = Array.from(container.querySelectorAll('.grid button'))
    expect(choiceButtons.length).toBeGreaterThan(0)
    for (const button of choiceButtons) {
      expect(button.querySelector('.font-kana')).not.toBeNull()
    }
  })

  it('answering reveals the target romaji/display label', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Recall')

    const choiceButtons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    act(() => fireEvent.click(choiceButtons[0]))

    const romajiValues = Object.values(CHARACTERS_BY_ID).map((c) => c.displayLabel ?? c.romaji)
    const revealed = Array.from(container.querySelectorAll('span')).some((el) => romajiValues.includes(el.textContent ?? ''))
    expect(revealed).toBe(true)
    // Replaying stays available after answering too.
    expect(container.querySelector('[aria-label="Replay audio"]')).not.toBeNull()
  })
})

describe('KanaQuizPage character Review streak (both modes)', () => {
  it('Read: a wrong answer activates character Review for the target character at 0/2', () => {
    const { container } = renderRowQuiz()
    selectMode(container, 'Read')

    const kanaEl = container.querySelector('.font-kana.text-7xl')!
    const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const wrongButton = buttons.find((b) => b.textContent !== (CHARACTERS_BY_ID[targetId].displayLabel ?? CHARACTERS_BY_ID[targetId].romaji))!

    act(() => fireEvent.click(wrongButton))

    expect(useProgressStore.getState().characters[targetId]).toMatchObject({ reviewActive: true, reviewStreak: 0 })
  })

  it('Recall: a wrong answer activates character Review for the target character at 0/2', () => {
    // Recall never shows the target before answering, so the target is
    // identified deterministically from the audio element the round-start
    // autoplay used (its .src encodes "characters/<id>.wav") rather than by
    // guessing/retrying — then a choice that is NOT that kana is clicked,
    // guaranteeing a miss.
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container } = renderRowQuiz()
    selectMode(container, 'Recall')

    const promptAudio = playSpy.mock.instances[0] as HTMLAudioElement
    const match = promptAudio.src.match(/\/audio\/characters\/([^/]+)\.wav$/)
    expect(match).not.toBeNull()
    const targetId = match![1]
    const targetKana = CHARACTERS_BY_ID[targetId].kana

    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const wrongButton = buttons.find((b) => b.textContent !== targetKana)!

    act(() => fireEvent.click(wrongButton))

    expect(useProgressStore.getState().characters[targetId]).toMatchObject({ reviewActive: true, reviewStreak: 0 })

    playSpy.mockRestore()
  })
})

describe('KanaQuizPage session/summary behavior', () => {
  it('keeps the normal 8-question session length', () => {
    const { container, getByText } = renderRowQuiz()
    selectMode(container, 'Read')
    expect(getByText(/Round 1 \/ 8/)).toBeInTheDocument()
  })

  it('Play again keeps the same mode, and Switch mode returns to the selector without leaving Kana Quiz', () => {
    vi.useFakeTimers()
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container, getByText, getByRole } = renderRowQuiz()
    selectMode(container, 'Read')

    // Answer all 8 Read rounds correctly by reading the visible kana prompt
    // each time (Read shows the target, so this is deterministic).
    for (let round = 0; round < 8; round++) {
      const kanaEl = container.querySelector('.font-kana.text-7xl')!
      const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
      const target = CHARACTERS_BY_ID[targetId]
      const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
      const correctButton = buttons.find((b) => b.textContent === (target.displayLabel ?? target.romaji))!
      act(() => fireEvent.click(correctButton))
      act(() => vi.advanceTimersByTime(2000))
    }

    expect(getByText('Kana Quiz complete!')).toBeInTheDocument()

    // Play again keeps Read mode — no mode selector shown, straight into a
    // new round with the kana prompt already visible.
    act(() => fireEvent.click(getByRole('button', { name: /play again/i })))
    expect(container.querySelector('.font-kana.text-7xl')).not.toBeNull()

    // Finish again to reach the summary, then use Switch mode.
    for (let round = 0; round < 8; round++) {
      const kanaEl = container.querySelector('.font-kana.text-7xl')!
      const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
      const target = CHARACTERS_BY_ID[targetId]
      const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
      const correctButton = buttons.find((b) => b.textContent === (target.displayLabel ?? target.romaji))!
      act(() => fireEvent.click(correctButton))
      act(() => vi.advanceTimersByTime(2000))
    }
    act(() => fireEvent.click(getByRole('button', { name: /switch mode/i })))

    // Back at the selector — still inside Kana Quiz, not navigated away.
    expect(getByText('Read')).toBeInTheDocument()
    expect(getByText('Recall')).toBeInTheDocument()

    playSpy.mockRestore()
    vi.useRealTimers()
  })
})

describe('KanaQuizPage mistake replay', () => {
  it('still works: missing one round in Read mode offers a working "Review 1 mistake" replay', () => {
    vi.useFakeTimers()
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container, getByRole, getByText } = renderRowQuiz()
    selectMode(container, 'Read')

    for (let round = 0; round < 8; round++) {
      const kanaEl = container.querySelector('.font-kana.text-7xl')!
      const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
      const target = CHARACTERS_BY_ID[targetId]
      const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
      if (round === 0) {
        // Deliberately wrong: any choice that isn't the target's own label.
        const wrongButton = buttons.find((b) => b.textContent !== (target.displayLabel ?? target.romaji))!
        act(() => fireEvent.click(wrongButton))
        const next = getByRole('button', { name: /next/i })
        act(() => fireEvent.click(next))
      } else {
        const correctButton = buttons.find((b) => b.textContent === (target.displayLabel ?? target.romaji))!
        act(() => fireEvent.click(correctButton))
        act(() => vi.advanceTimersByTime(2000))
      }
    }

    const reviewButton = getByRole('button', { name: /review 1 mistake/i })
    act(() => fireEvent.click(reviewButton))

    expect(getByText(/Round 1 \/ 1/)).toBeInTheDocument()
    expect(container.querySelector('.font-kana.text-7xl')).not.toBeNull()

    playSpy.mockRestore()
    vi.useRealTimers()
  })
})

describe('KanaQuizPage Review empty state', () => {
  it('shows a success state instead of a blank page when nothing is active in character Review', () => {
    useProgressStore.getState().markRowTaught('a-row')

    const { container } = render(
      <MemoryRouter initialEntries={['/practice/review/kana-quiz']}>
        <Routes>
          <Route path="/practice/review/kana-quiz" element={<KanaQuizPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(container.textContent).toMatch(/Review complete!/)
    expect(container.querySelector('.font-kana')).toBeNull()
  })

  it('the mode selector and both modes work for Review-scoped Kana Quiz too', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordCharacterReviewResult('a', false)

    const { container, getByText } = render(
      <MemoryRouter initialEntries={['/practice/review/kana-quiz']}>
        <Routes>
          <Route path="/practice/review/kana-quiz" element={<KanaQuizPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(getByText('Read')).toBeInTheDocument()
    expect(getByText('Recall')).toBeInTheDocument()

    selectMode(container, 'Recall')
    const choiceButtons = Array.from(container.querySelectorAll('.grid button'))
    expect(choiceButtons.length).toBeGreaterThan(0)
    expect(container.querySelector('.font-kana.text-7xl')).toBeNull()
  })
})
