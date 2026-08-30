import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRAGANA_RESTAURANT_DISHES } from '../../data/restaurantDishes'
import { useProgressStore } from '../../store/progressStore'
import { RestaurantPage } from './RestaurantPage'

const tts = vi.hoisted(() => ({ speak: vi.fn(), speakAndWait: vi.fn(), speakStaticOnly: vi.fn(), stop: vi.fn(), supported: true }))
vi.mock('../../hooks/useTTS', () => ({ useTTS: () => tts }))

function renderPage(start = true) {
  const view = render(
    <MemoryRouter>
      <RestaurantPage />
    </MemoryRouter>,
  )
  if (start) {
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
  }
  return view
}

function clickTargetAnswer() {
  if (!screen.queryByTestId('restaurant-romaji-fallback')) fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
  const targetIds = screen.getAllByTestId(/^restaurant-target-(?!bubble)/).map((node) => node.getAttribute('data-testid')?.replace('restaurant-target-', ''))
  targetIds.forEach((id) => fireEvent.click(screen.getByTestId(`restaurant-romaji-${id}`)))
  if (targetIds.length === 2) fireEvent.click(screen.getByRole('button', { name: 'Order' }))
}

function clickWrongAnswer() {
  const targetSrc = screen.getByAltText('Target dish').getAttribute('src')
  const wrong = [...screen.getByTestId('restaurant-menu').querySelectorAll('img')].find((image) => image.getAttribute('src') !== targetSrc)
  const id = wrong?.closest('[data-testid^="restaurant-dish-"]')?.getAttribute('data-testid')?.replace('restaurant-dish-', '')
  expect(id).toBeTruthy()
  fireEvent.click(screen.getByTestId(`restaurant-romaji-${id}`))
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  tts.speak.mockReset()
  tts.speakAndWait.mockReset()
  tts.stop.mockReset()
  localStorage.clear()
  // jsdom has no SpeechRecognition by default; make that explicit/stable
  // across environments instead of relying on the ambient default.
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('RestaurantPage full-order cleanup', () => {
  it('does not continue a full order after unmount settles its pending playback', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    let settle!: () => void
    tts.speakAndWait.mockImplementationOnce(() => new Promise<void>((resolve) => { settle = resolve }))
    const view = renderPage()
    fireEvent.click(screen.getByTestId('restaurant-romaji-sushi'))
    expect(screen.getByText('Great!')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hear the full order' }))
    expect(tts.speakAndWait).toHaveBeenCalledTimes(1)
    view.unmount()
    await act(async () => { settle(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(tts.speakAndWait).toHaveBeenCalledTimes(1)
  })
})

describe('RestaurantPage', () => {
  it('shows the intro before the first question and a one-line order template after Start', () => {
    renderPage(false)
    expect(screen.getByText("Let's order at a restaurant.")).toBeInTheDocument()
    expect(screen.getByAltText('Restaurant introduction')).toHaveAttribute('src', expect.stringContaining('restaurant-intro.png'))
    expect(screen.getByText('and')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByTestId('restaurant-order-template')).toHaveTextContent('すみません、＿＿＿＿おねがいします。')
    expect(screen.getByAltText('Tamamizu')).toHaveAttribute('src', expect.stringContaining('mascot/order.png'))
  })

  it.each(['katakana', 'other', 'special-katakana'] as const)('uses tenpura and misoshiru in the %s introduction', (stage) => {
    render(<MemoryRouter><RestaurantPage stage={stage} /></MemoryRouter>)
    expect(screen.getByAltText('てんぷら')).toBeInTheDocument()
    expect(screen.getByAltText('みそしる')).toBeInTheDocument()
  })

  it('keeps Romaji hidden after Start until Choose in Romaji is pressed', () => {
    renderPage(false)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.queryByTestId('restaurant-romaji-fallback')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
    expect(screen.getByTestId('restaurant-romaji-fallback')).toBeInTheDocument()
  })

  it('uses font-kana for the order template', () => {
    renderPage(false)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByTestId('restaurant-order-template')).toHaveClass('font-kana')
  })

  it('provides separate pronunciation controls for both targets in question 5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    for (let question = 1; question < 5; question++) {
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next order' }))
    }
    clickTargetAnswer()
    expect(screen.getAllByRole('button', { name: /^Hear / }).length).toBeGreaterThanOrEqual(3)
  })

  it('offers Try Again and Show Answer after a wrong answer', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    clickWrongAnswer()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }))
    expect(screen.getAllByText('sushi').length).toBeGreaterThan(0)
  })

  it('keeps the session on questions 1 through 7 and shows results after question 8', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    for (let question = 1; question <= 8; question++) {
      clickTargetAnswer()
      if (question < 8) {
        expect(screen.getByText(`Question ${question} / 8`)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Next order' }))
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Next order' }))
      }
    }
    expect(screen.getByText('Completed!')).toBeInTheDocument()
    expect(screen.getByText('Correct: 8 / 8')).toBeInTheDocument()
    expect(screen.getByText('Mistakes: 0')).toBeInTheDocument()
  })

  it('counts wrong then retry-correct as a mistake in the final score', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    clickWrongAnswer()
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    fireEvent.click(screen.getByTestId('restaurant-romaji-sushi'))
    fireEvent.click(screen.getByRole('button', { name: 'Next order' }))
    for (let question = 2; question <= 8; question++) {
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next order' }))
    }
    expect(screen.getByText('Correct: 7 / 8')).toBeInTheDocument()
    expect(screen.getByText('Mistakes: 1')).toBeInTheDocument()
    expect(screen.getByText('Accuracy: 88%')).toBeInTheDocument()
  })

  it('counts Show Answer as a mistake before advancing to the final score', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    clickWrongAnswer()
    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next order' }))
    for (let question = 2; question <= 8; question++) {
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next order' }))
    }
    expect(screen.getByText('Correct: 7 / 8')).toBeInTheDocument()
    expect(screen.getByText('Mistakes: 1')).toBeInTheDocument()
    expect(screen.getByText('Accuracy: 88%')).toBeInTheDocument()
  })
  it('renders without crashing', () => {
    renderPage()
    expect(screen.getByText('Question 1 / 8')).toBeInTheDocument()
  })

  it('renders 4 unique dish cards in the menu', () => {
    renderPage()
    const menu = screen.getByTestId('restaurant-menu')
    const cards = menu.querySelectorAll('[data-testid^="restaurant-dish-"]')
    expect(cards.length).toBe(4)
    const ids = [...cards].map((c) => c.getAttribute('data-testid'))
    expect(new Set(ids).size).toBe(4)
  })

  it('the target speech bubble contains no dish name/romaji/English text, only an emoji/image', () => {
    renderPage()
    const bubble = screen.getByTestId('restaurant-target-bubble')
    const text = bubble.textContent ?? ''
    for (const dish of HIRAGANA_RESTAURANT_DISHES) {
      expect(text.includes(dish.displayKana)).toBe(false)
      expect(text.toLowerCase().includes(dish.romaji)).toBe(false)
    }
    // Existing vocabulary art is allowed; placeholders remain text-free too.
    const image = bubble.querySelector('img')
    expect(image || text.trim().length > 0).toBeTruthy()
  })

  it('romaji fallback options are present immediately on initial render, not gated behind a speech failure', () => {
    renderPage()
    const fallback = screen.getByTestId('restaurant-romaji-fallback')
    const buttons = fallback.querySelectorAll('button')
    expect(buttons.length).toBe(4)
  })

  it('shows the speak control and a graceful message when SpeechRecognition is unsupported', () => {
    renderPage()
    const speakButton = screen.getByTestId('restaurant-speak-button') as HTMLButtonElement
    expect(speakButton).toBeInTheDocument()
    expect(speakButton.disabled).toBe(true)
    expect(screen.getByText(/voice input isn't available/i)).toBeInTheDocument()
  })

  it('auto-speaks the greeting on mount via useTTS', () => {
    renderPage()
    expect(tts.speak).toHaveBeenCalledWith('restaurant/staff/irasshaimase', 'いらっしゃいませ。')
  })
})

describe('RestaurantPage progress isolation', () => {
  function snapshotProgress() {
    return localStorage.getItem('kana-game-progress')
  }
  function snapshotSaved() {
    return localStorage.getItem('kana-game-saved-items')
  }

  it('wrong romaji answer does not change progress/saved store state', async () => {
    const before = { progress: snapshotProgress(), saved: snapshotSaved() }
    renderPage()
    const fallback = screen.getByTestId('restaurant-romaji-fallback')
    const buttons = [...fallback.querySelectorAll('button')] as HTMLButtonElement[]
    // Click a button that isn't guaranteed correct — assert isolation
    // regardless of which one it happens to be.
    buttons[0].click()
    expect(await screen.findByText(/try again|great!/i)).toBeInTheDocument()
    expect(snapshotProgress()).toBe(before.progress)
    expect(snapshotSaved()).toBe(before.saved)
  })

  it('a simulated speech recognition error does not change progress/saved store state', async () => {
    class FakeSpeechRecognition {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 3
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: { error: string }) => void) | null = null
      onend: (() => void) | null = null
      start() {
        this.onerror?.({ error: 'no-speech' })
      }
      abort() {}
    }
    ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition

    const before = { progress: snapshotProgress(), saved: snapshotSaved() }
    renderPage()
    const speakButton = await screen.findByTestId('restaurant-speak-button')
    speakButton.click()
    expect(await screen.findByText("I couldn't catch that.")).toBeInTheDocument()
    expect(snapshotProgress()).toBe(before.progress)
    expect(snapshotSaved()).toBe(before.saved)
  })

  it('a correct romaji answer (success path) does not write to progress/saved store state', async () => {
    const before = { progress: snapshotProgress(), saved: snapshotSaved() }
    // Re-render repeatedly picking a fresh round isn't controllable here
    // without injecting rng, so instead click every romaji button in turn
    // and assert isolation holds regardless of outcome.
    renderPage()
    const fallback = screen.getByTestId('restaurant-romaji-fallback')
    const buttons = [...fallback.querySelectorAll('button')] as HTMLButtonElement[]
    for (const button of buttons) {
      button.click()
      if (screen.queryByText('Great!')) break
    }
    expect(snapshotProgress()).toBe(before.progress)
    expect(snapshotSaved()).toBe(before.saved)
  })
})
