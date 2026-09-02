import { fireEvent, render, screen } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAFE_DISHES, RESTAURANT_DISHES, isKatakanaOnlyDish } from '../../data/restaurantDishes'
import { useProgressStore } from '../../store/progressStore'
import { CafePage } from './CafePage'

const tts = vi.hoisted(() => ({ speak: vi.fn(), speakAndWait: vi.fn(), speakStaticOnly: vi.fn(), stop: vi.fn(), supported: true }))
vi.mock('../../hooks/useTTS', () => ({ useTTS: () => tts }))

const CHECKPOINT_ID = 'katakana-ha-row'
const CHECKPOINT_DISHES = CAFE_DISHES.filter((d) => d.checkpointId === CHECKPOINT_ID)

function mascotSource() {
  return screen.getByTestId('mascot-stage').querySelector('img')?.getAttribute('src')
}

function renderPage(start = true) {
  const view = render(
    <MemoryRouter>
      <CafePage checkpointId={CHECKPOINT_ID} />
    </MemoryRouter>,
  )
  if (start) {
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
  }
  return view
}

function currentTargetIds() {
  return screen.getAllByTestId(/^cafe-target-(?!bubble)/).map((node) => node.getAttribute('data-testid')!.replace('cafe-target-', ''))
}

function clickTargetAnswer() {
  if (!screen.queryByTestId('cafe-romaji-fallback')) fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
  const targetIds = currentTargetIds()
  targetIds.forEach((id) => fireEvent.click(screen.getByTestId(`cafe-romaji-${id}`)))
  if (targetIds.length === 2) fireEvent.click(screen.getByRole('button', { name: 'Order' }))
}

function currentWrongMenuDish() {
  const targetIds = new Set(currentTargetIds())
  return [...screen.getByTestId('cafe-menu').querySelectorAll('[data-testid^="cafe-dish-"]')]
    .map((node) => node.getAttribute('data-testid')!.replace('cafe-dish-', ''))
    .find((candidate) => !targetIds.has(candidate))!
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  tts.speak.mockReset()
  tts.speakAndWait.mockReset()
  tts.stop.mockReset()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CafePage', () => {
  it('shows the intro before the first question, using コーヒー + ケーキ as the example (Issue #160)', () => {
    renderPage(false)
    expect(screen.getByText("Let's order at a cafe.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByTestId('cafe-order-template')).toHaveTextContent('すみません、＿＿＿＿ おねがいします。')
  })

  it('shows the real Cafe intro scene image, not the pending/hidden placeholder (follow-up: Cafe intro scene art)', () => {
    renderPage(false)
    const image = screen.getByAltText('Cafe introduction')
    expect(image).toHaveAttribute('src', expect.stringContaining('mascot/cafe-intro.webp'))
    // No onError-hide fallback anymore — the real asset is expected to load.
    expect(image).not.toHaveAttribute('onerror')
    expect(fs.existsSync(path.resolve(process.cwd(), 'public/mascot/cafe-intro.webp'))).toBe(true)
  })

  it('is Katakana-only: every dish in this checkpoint\'s pool is katakana-only (Issue #160)', () => {
    for (const dish of CHECKPOINT_DISHES) {
      expect(isKatakanaOnlyDish(dish), `${dish.id}: "${dish.displayKana}" is not katakana-only`).toBe(true)
    }
  })

  it('renders the 3-row structure: menu, then Tamamizu bubble, then order template', () => {
    renderPage()
    const menu = screen.getByTestId('cafe-menu')
    const bubble = screen.getByTestId('cafe-target-bubble')
    const template = screen.getByTestId('cafe-order-template')
    expect(menu.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bubble.compareDocumentPosition(template) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('menu shows text + price only, no image clue, before an answer', () => {
    renderPage()
    const menu = screen.getByTestId('cafe-menu')
    expect(menu.querySelector('img')).toBeNull()
    const rows = [...menu.querySelectorAll('[data-testid^="cafe-dish-"]')]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const id = row.getAttribute('data-testid')!.replace('cafe-dish-', '')
      const dish = RESTAURANT_DISHES.find((d) => d.id === id)
      if (dish) {
        expect(row).toHaveTextContent(dish.displayKana)
        expect(row).toHaveTextContent(`¥${dish.priceYen}`)
      }
    }
  })

  it('clearly points at the target menu row (not the bubble) before an answer (Issue #164 review)', () => {
    renderPage()
    const bubble = screen.getByTestId('cafe-target-bubble')
    const targetId = currentTargetIds()[0]
    const dish = RESTAURANT_DISHES.find((d) => d.id === targetId)!
    // The marker (and the target's kana) lives on the menu row, not the bubble.
    expect(screen.getByTestId(`cafe-menu-target-${targetId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`cafe-dish-${targetId}`)).toHaveTextContent(dish.displayKana)
    expect(bubble.querySelector('img')).toBeNull()
    expect(bubble).not.toHaveTextContent(dish.displayKana)
    // English/meaning must not leak before an answer either.
    expect(bubble).not.toHaveTextContent(dish.english)
  })

  it('marks only the target menu row(s), leaving every other row unmarked', () => {
    renderPage()
    const targetIds = new Set(currentTargetIds())
    const rows = [...screen.getByTestId('cafe-menu').querySelectorAll('[data-testid^="cafe-dish-"]')]
    for (const row of rows) {
      const id = row.getAttribute('data-testid')!.replace('cafe-dish-', '')
      const marker = row.querySelector(`[data-testid="cafe-menu-target-${id}"]`)
      if (targetIds.has(id)) expect(marker).not.toBeNull()
      else expect(marker).toBeNull()
    }
  })

  it('does not reveal the target meaning/image/kana before an answer', () => {
    renderPage()
    const bubble = screen.getByTestId('cafe-target-bubble')
    for (const dish of CHECKPOINT_DISHES) {
      expect(bubble.textContent ?? '').not.toContain(dish.english)
      expect(bubble.textContent ?? '').not.toContain(dish.displayKana)
    }
    expect(bubble.querySelector('img')).toBeNull()
  })

  it('after a correct answer, the speech bubble switches to the ordered item\'s image/emoji + English meaning', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    const targetId = currentTargetIds()[0]
    const dish = RESTAURANT_DISHES.find((d) => d.id === targetId)!
    clickTargetAnswer()
    expect(screen.getByText('Great!')).toBeInTheDocument()
    const bubble = screen.getByTestId('cafe-target-bubble')
    expect(bubble).toHaveTextContent(dish.english)
  })

  it('after a revealed wrong answer, the speech bubble also switches to image + English', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    const wrongId = currentWrongMenuDish()
    fireEvent.click(screen.getByTestId(`cafe-romaji-${wrongId}`))
    const targetId = currentTargetIds()[0]
    const dish = RESTAURANT_DISHES.find((d) => d.id === targetId)!
    const bubble = screen.getByTestId('cafe-target-bubble')
    expect(bubble).toHaveTextContent(dish.english)
  })

  it('feedback keeps romaji but does NOT repeat English under it (Issue #160 — Cafe already reveals English in the bubble)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    const targetId = currentTargetIds()[0]
    const dish = RESTAURANT_DISHES.find((d) => d.id === targetId)!
    clickTargetAnswer()
    expect(screen.getByText('Great!')).toBeInTheDocument()
    expect(screen.getByText(dish.romaji)).toBeInTheDocument()
    // The feedback panel (as opposed to the target bubble) must not show a
    // second copy of the English text below the romaji.
    const feedbackPanel = screen.getByText(dish.romaji).closest('div')!
    const englishNodes = [...feedbackPanel.querySelectorAll('p')].filter((p) => p.textContent === dish.english)
    expect(englishNodes).toHaveLength(0)
  })

  it('runs the same 8-question / Q5-8 two-item structure as Restaurant', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    for (let question = 1; question < 5; question++) {
      expect(currentTargetIds()).toHaveLength(1)
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(currentTargetIds()).toHaveLength(2)
    clickTargetAnswer()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    for (let question = 6; question <= 8; question++) {
      expect(currentTargetIds()).toHaveLength(2)
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('Completed!')).toBeInTheDocument()
    expect(screen.getByText('8 of 8 correct')).toBeInTheDocument()
  })

  it('shows the correct/incorrect mascot the same way as Restaurant', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    clickTargetAnswer()
    expect(mascotSource()).toContain('mascot/correct.webp')
  })

  it('offers Choose in Romaji rescue and keeps progress/saved store isolated (no curriculum/Review/SRS mutation)', () => {
    const before = { progress: localStorage.getItem('kana-game-progress'), saved: localStorage.getItem('kana-game-saved-items') }
    renderPage()
    expect(screen.getByTestId('cafe-romaji-fallback')).toBeInTheDocument()
    const fallback = screen.getByTestId('cafe-romaji-fallback')
    const buttons = [...fallback.querySelectorAll('button')] as HTMLButtonElement[]
    buttons[0].click()
    expect(localStorage.getItem('kana-game-progress')).toBe(before.progress)
    expect(localStorage.getItem('kana-game-saved-items')).toBe(before.saved)
  })
})
