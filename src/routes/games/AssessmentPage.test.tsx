import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgressStore } from '../../store/progressStore'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { WORDS_BY_ROW } from '../../data/words'
import type { AssessmentAnswer } from '../../lib/assessmentResults'
import { AssessmentPage, AssessmentResultsScreen } from './AssessmentPage'

const tts = vi.hoisted(() => ({ speak: vi.fn(), speakAndWait: vi.fn(), speakStaticOnly: vi.fn(), stop: vi.fn(), supported: true }))
vi.mock('../../hooks/useTTS', () => ({ useTTS: () => tts }))

type RecognitionAlternative = { transcript?: unknown } | undefined
type RecognitionResult = { [index: number]: RecognitionAlternative; length: number }
type RecognitionEvent = { results: { [index: number]: RecognitionResult | undefined; length: number } }

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = []
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 3
  onresult: ((event: RecognitionEvent) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  abort = vi.fn()

  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }

  result(transcript: string) {
    const result = Object.assign([{ transcript }], { length: 1 }) as unknown as RecognitionResult
    this.onresult?.({ results: Object.assign([result], { length: 1 }) })
  }

  error(error = 'no-speech') {
    this.onerror?.({ error })
  }
}

function installFakeSpeechRecognition() {
  FakeSpeechRecognition.instances = []
  ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition
}

function renderAssessment(script: 'hiragana' | 'katakana') {
  return render(
    <MemoryRouter initialEntries={[`/assessment/${script}`]}>
      <Routes>
        <Route path="/assessment/:script" element={<AssessmentPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  tts.speak.mockReset()
  localStorage.clear()
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  FakeSpeechRecognition.instances = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Answers whatever question is currently on screen — correctness doesn't
// matter for most assertions here (assessment never gates progression on
// score, see progressStore.test.ts's dedicated coverage of that), so this
// always takes the fastest deterministic path per family rather than
// hunting for the correct choice. Word Reading always uses Romaji (not
// speech) here so tests stay deterministic without a fake
// SpeechRecognition installed; speech-specific behavior gets its own test
// below with SpeechRecognition explicitly faked.
// Waits until either a "Next" button appears (advance normally) or the
// results screen appears (the just-answered question was the last of all
// 20 — completion can legitimately happen without ever rendering "Next"
// for that final round). Clicks Next only in the former case.
async function waitAndAdvanceIfPossible() {
  await waitFor(() => {
    if (screen.queryByText(/complete!/)) return
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })
  const next = screen.queryByRole('button', { name: 'Next' })
  if (next) fireEvent.click(next)
}

async function answerCurrentQuestionAnyWay() {
  if (screen.queryByText(/complete!/)) return
  if (screen.queryByTestId('word-reading-speak-button')) {
    fireEvent.click(screen.getByText('Choose in Romaji'))
    const correctButton = await screen.findByTestId('word-reading-romaji-correct')
    fireEvent.click(correctButton)
    await waitAndAdvanceIfPossible()
    return
  }

  const slots = document.querySelectorAll('.border-dashed')
  if (slots.length > 0) {
    // Word Builder: click enabled tray tiles (KanaTile buttons, identified
    // by their distinctive font-kana class) one at a time until every slot
    // fills — whether or not this lands the correct spelling, `status`
    // still leaves 'playing' until then, which is all this needs. Re-query
    // after each click since a placed tile becomes disabled and the DOM
    // re-renders.
    const slotCount = slots.length
    for (let clicked = 0; clicked < slotCount; clicked++) {
      const tile = document.querySelector<HTMLButtonElement>('button.font-kana:not(:disabled)')
      if (!tile) break
      fireEvent.click(tile)
    }
    await waitAndAdvanceIfPossible()
    return
  }

  // Kana Quiz / Listening: a 2x2 grid of choice buttons.
  const choiceButtons = document.querySelectorAll('.grid.grid-cols-2 button')
  if (choiceButtons.length === 0) return
  fireEvent.click(choiceButtons[0])
  await waitAndAdvanceIfPossible()
}

async function answerCurrentQuestionWithoutNext() {
  if (screen.queryByTestId('word-reading-speak-button')) {
    fireEvent.click(screen.getByText('Choose in Romaji'))
    fireEvent.click(screen.getByTestId('word-reading-romaji-correct'))
    return
  }
  const slots = document.querySelectorAll('.border-dashed')
  if (slots.length > 0) {
    for (let clicked = 0; clicked < slots.length; clicked++) {
      const tile = document.querySelector<HTMLButtonElement>('button.font-kana:not(:disabled)')
      if (tile) fireEvent.click(tile)
    }
    return
  }
  const choice = document.querySelector<HTMLButtonElement>('.grid.grid-cols-2 button')
  if (choice) fireEvent.click(choice)
}

describe('AssessmentPage', () => {
  it('keeps every question family on feedback until the learner presses Next', async () => {
    renderAssessment('hiragana')
    await screen.findByText('Question 1 / 20', { exact: false })
    vi.useFakeTimers()
    const seenFamilies = new Set<string>()
    for (let questionNumber = 1; questionNumber <= 20; questionNumber++) {
      const progress = screen.getByText(`Question ${questionNumber} / 20`, { exact: false })
      const family = progress.textContent?.split('·')[1]?.trim()
      if (family) seenFamilies.add(family)
      await answerCurrentQuestionWithoutNext()
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()

      act(() => vi.advanceTimersByTime(2500))
      expect(screen.getByText(`Question ${questionNumber} / 20`, { exact: false })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(seenFamilies).toEqual(new Set(['Kana Quiz', 'Listening', 'Word Builder', 'Word Reading']))
  }, 10000)

  it('renders a 20-question session and completes without gating on score', async () => {
    renderAssessment('hiragana')
    await screen.findByText(/Question 1 \/ 20/)
    // Exactly 20 questions total (see assessmentPlan.test.ts's own coverage
    // of that invariant) — stop as soon as the results screen appears
    // rather than assuming a fixed iteration count, since the LAST
    // question's answer can itself trigger completion.
    for (let i = 0; i < 20; i++) {
      if (screen.queryByText(/complete!/)) break
      await answerCurrentQuestionAnyWay()
    }
    await waitFor(() => expect(screen.getByText(/complete!/)).toBeInTheDocument())
    expect(useProgressStore.getState().isAssessmentCompleted('hiragana')).toBe(true)
    expect(screen.getByText('Kana → Sound')).toBeInTheDocument()
    expect(screen.getByText('Sound → Kana')).toBeInTheDocument()
    // Family-level score cards were deliberately removed from the learner
    // result UI; the two reading-direction summaries replace them.
    expect(screen.queryByText('Kana Quiz')).not.toBeInTheDocument()
  }, 20000)

  it('never targets katakana characters/words for the Hiragana Test', async () => {
    renderAssessment('hiragana')
    await screen.findByText(/Question 1 \/ 20/)
    // Word Reading (if it's the first question) shows the target kana
    // directly; either way no katakana-only glyph should ever render as a
    // prompt. This is a light structural smoke check backed by the
    // exhaustive unit coverage in assessmentPlan.test.ts.
    expect(document.body.textContent).not.toMatch(/[ァ-ヴー]/)
  })

  describe('Word Reading', () => {
    it('hides meaning/image/romaji before answering and reveals them after a correct romaji answer', async () => {
      // Force every question to be Word Reading isn't controllable without
      // reaching into the plan directly, so instead: click through until a
      // Word Reading question appears (bounded by the fixed 5-per-family
      // count), then assert on it specifically.
      renderAssessment('hiragana')
      await screen.findByText(/Question 1 \/ 20/)
      let found = false
      for (let i = 0; i < 20 && !found; i++) {
        if (screen.queryByTestId('word-reading-speak-button')) {
          found = true
          break
        }
        await answerCurrentQuestionAnyWay()
      }
      expect(found).toBe(true)
      // Before answering: no "correct" panel, no meaning/romaji reveal box.
      expect(screen.queryByText(/Correct!|Not quite\./)).not.toBeInTheDocument()

      fireEvent.click(screen.getByText('Choose in Romaji'))
      const correctButton = await screen.findByTestId('word-reading-romaji-correct')
      fireEvent.click(correctButton)

      // After answering: reveal panel with meaning/romaji appears.
      await waitFor(() => expect(screen.getByText(/Correct!/)).toBeInTheDocument())
    })

    it('does not treat a speech-recognition failure as a final wrong answer — Romaji fallback still completes the question', async () => {
      installFakeSpeechRecognition()
      renderAssessment('hiragana')
      await screen.findByText(/Question 1 \/ 20/)
      let found = false
      for (let i = 0; i < 20 && !found; i++) {
        if (screen.queryByTestId('word-reading-speak-button')) {
          found = true
          break
        }
        await answerCurrentQuestionAnyWay()
      }
      expect(found).toBe(true)

      fireEvent.click(screen.getByTestId('word-reading-speak-button'))
      const recognition = FakeSpeechRecognition.instances.at(-1)!
      recognition.error('no-speech')

      // A failed speech attempt must not show "Not quite." (a final wrong
      // answer) — it should still offer Try Again / Romaji fallback.
      await waitFor(() => expect(screen.getByText('Choose in Romaji')).toBeInTheDocument())
      expect(screen.queryByText('Not quite.')).not.toBeInTheDocument()
      expect(screen.queryByTestId('word-reading-speak-button')).not.toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Try Again'))
      const retryRecognition = FakeSpeechRecognition.instances.at(-1)!
      expect(retryRecognition).not.toBe(recognition)
      retryRecognition.error('no-speech')
      await waitFor(() => expect(screen.queryByText('Try Again')).not.toBeInTheDocument())
      expect(screen.queryByTestId('word-reading-speak-button')).not.toBeInTheDocument()

      fireEvent.click(screen.getByText('Choose in Romaji'))
      const correctButton = await screen.findByTestId('word-reading-romaji-correct')
      fireEvent.click(correctButton)
      await waitFor(() => expect(screen.getByText(/Correct!/)).toBeInTheDocument())

      // Moving forward to another Word Reading question must create a fresh
      // recognizer which can start normally; a failure in the previous word
      // must never leave the speech hook in its fallback-only state.
      await waitAndAdvanceIfPossible()
      let nextWordReadingFound = false
      for (let i = 0; i < 20 && !nextWordReadingFound; i++) {
        if (screen.queryByTestId('word-reading-speak-button')) {
          nextWordReadingFound = true
          break
        }
        await answerCurrentQuestionAnyWay()
      }
      expect(nextWordReadingFound).toBe(true)
      fireEvent.click(screen.getByTestId('word-reading-speak-button'))
      const freshRecognition = FakeSpeechRecognition.instances.at(-1)!
      expect(freshRecognition).not.toBe(retryRecognition)
      expect(freshRecognition.start).toHaveBeenCalledTimes(1)
    })

    it('uses only Tamamizu answer feedback after a successful spoken reading', async () => {
      installFakeSpeechRecognition()
      renderAssessment('hiragana')
      await screen.findByText(/Question 1 \/ 20/)
      for (let i = 0; i < 20 && !screen.queryByTestId('word-reading-speak-button'); i++) await answerCurrentQuestionAnyWay()

      const targetKana = document.querySelector('[data-testid="word-reading-speak-button"]')
        ?.parentElement?.parentElement?.querySelector('.font-kana')?.textContent
      expect(targetKana).toBeTruthy()
      const callCount = tts.speak.mock.calls.length
      fireEvent.click(screen.getByTestId('word-reading-speak-button'))
      FakeSpeechRecognition.instances.at(-1)!.result(targetKana!)

      await screen.findByText('Correct!')
      const answerCalls = tts.speak.mock.calls.slice(callCount)
      expect(answerCalls.some(([key]) => String(key).startsWith('feedback/'))).toBe(true)
      expect(answerCalls.some(([key]) => String(key).startsWith('words/'))).toBe(false)
    })
  })

  describe('Word Builder (assessment mode)', () => {
    it('hides meaning/image before answering', async () => {
      renderAssessment('hiragana')
      await screen.findByText(/Question 1 \/ 20/)
      let found = false
      for (let i = 0; i < 20 && !found; i++) {
        const slots = document.querySelectorAll('.border-dashed')
        if (slots.length > 0) {
          found = true
          break
        }
        await answerCurrentQuestionAnyWay()
      }
      expect(found).toBe(true)
      // Before answering: no meaning text block should be visible (only the
      // 🔊 prompt icon, matching the "before answering" hidden state).
      expect(screen.getByText('🔊')).toBeInTheDocument()
    })
  })

  it('lists every distinct kana and word missed in a result, beyond the former display caps', () => {
    const characterIds = ['a', 'i', 'u', 'e', 'o', 'ka', 'ki']
    const words = Object.values(WORDS_BY_ROW).flat().slice(0, 6)
    const answers: AssessmentAnswer[] = [
      ...characterIds.map((characterId) => ({
        question: { family: 'kana-quiz' as const, characterId, direction: 'kana-to-sound' as const },
        correct: false,
      })),
      ...words.map((word) => ({
        question: { family: 'word-reading' as const, word, direction: 'kana-to-sound' as const },
        correct: false,
      })),
    ]

    render(
      <MemoryRouter>
        <AssessmentResultsScreen
          script="hiragana"
          config={{ categoryId: 'hiragana', summaryRowId: 'hiragana-summary', label: 'Hiragana Test' }}
          answers={answers}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    )

    const mistakeList = screen.getByTestId('assessment-mistake-list')
    for (const characterId of characterIds) {
      const character = CHARACTERS_BY_ID[characterId]
      expect(mistakeList.textContent).toContain(character.kana)
      expect(mistakeList.textContent).toContain(character.romaji)
    }
    for (const word of words) {
      expect(mistakeList.textContent).toContain(word.kana)
      expect(mistakeList.textContent).toContain(word.romaji)
    }
    expect(mistakeList.children).toHaveLength(characterIds.length + words.length)
    expect([...mistakeList.children].every((entry) => entry.tagName === 'LI')).toBe(true)
    expect(screen.getByTestId('assessment-result-status')).toHaveTextContent('FAIL')
    expect(screen.getByTestId('assessment-result-image')).toHaveAttribute('src', expect.stringContaining('assessment-fail.png'))
    expect(tts.speak).toHaveBeenCalledWith('feedback/assessment-results/assessment-fail', 'FAIL')
  })
})
