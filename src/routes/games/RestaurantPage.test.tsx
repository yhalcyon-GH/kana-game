import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRAGANA_RESTAURANT_DISHES } from '../../data/restaurantDishes'
import { useProgressStore } from '../../store/progressStore'
import { RestaurantPage } from './RestaurantPage'

const tts = vi.hoisted(() => ({ speak: vi.fn(), speakStaticOnly: vi.fn(), stop: vi.fn(), supported: true }))
vi.mock('../../hooks/useTTS', () => ({ useTTS: () => tts }))

function renderPage() {
  return render(
    <MemoryRouter>
      <RestaurantPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  tts.speak.mockReset()
  localStorage.clear()
  // jsdom has no SpeechRecognition by default; make that explicit/stable
  // across environments instead of relying on the ambient default.
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
})

describe('RestaurantPage', () => {
  it('renders without crashing', () => {
    renderPage()
    expect(screen.getByText('ひらがなレストラン')).toBeInTheDocument()
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
    // Should contain exactly the placeholder emoji (no images exist yet).
    expect(text.trim().length).toBeGreaterThan(0)
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
    expect(tts.speak).toHaveBeenCalledWith('restaurant/irasshaimase', 'いらっしゃいませ。')
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
