import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRAGANA_RESTAURANT_DISHES } from '../../data/restaurantDishes'
import { useProgressStore } from '../../store/progressStore'
import { RestaurantPage } from './RestaurantPage'

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

  result(...alternatives: RecognitionAlternative[]) {
    const result = Object.assign([...alternatives], { length: alternatives.length }) as unknown as RecognitionResult
    this.onresult?.({ results: Object.assign([result], { length: 1 }) })
  }

  error(error = 'no-speech') {
    this.onerror?.({ error })
  }

  end() {
    this.onend?.()
  }
}

function installFakeSpeechRecognition() {
  FakeSpeechRecognition.instances = []
  ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition
}

async function startSpeech() {
  fireEvent.click(await screen.findByTestId('restaurant-speak-button'))
  return FakeSpeechRecognition.instances.at(-1)!
}

function currentTargetDishes() {
  const ids = screen.getAllByTestId(/^restaurant-target-(?!bubble)/).map((node) => node.getAttribute('data-testid')!.replace('restaurant-target-', ''))
  return ids.map((id) => HIRAGANA_RESTAURANT_DISHES.find((dish) => dish.id === id)!)
}

function mascotSource() {
  return screen.getByTestId('mascot-stage').querySelector('img')?.getAttribute('src')
}

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

function renderSpeechPage() {
  const view = renderPage(false)
  fireEvent.click(screen.getByRole('button', { name: 'Start' }))
  expect(screen.queryByTestId('restaurant-romaji-fallback')).not.toBeInTheDocument()
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

function currentWrongMenuDish() {
  const targetIds = new Set(currentTargetDishes().map((dish) => dish.id))
  const id = [...screen.getByTestId('restaurant-menu').querySelectorAll('[data-testid^="restaurant-dish-"]')]
    .map((node) => node.getAttribute('data-testid')!.replace('restaurant-dish-', ''))
    .find((candidate) => !targetIds.has(candidate))!
  return HIRAGANA_RESTAURANT_DISHES.find((dish) => dish.id === id)!
}

function finishSessionWithCorrectRomajiAnswers() {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  for (let question = 2; question <= 8; question++) {
    clickTargetAnswer()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  }
}

function finishSessionFromQuestionFive() {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  for (let question = 6; question <= 8; question++) {
    clickTargetAnswer()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  }
}

function clickWrongTwoDishAnswer() {
  const targetIds = new Set(currentTargetDishes().map((dish) => dish.id))
  const menuIds = [...screen.getByTestId('restaurant-menu').querySelectorAll('[data-testid^="restaurant-dish-"]')]
    .map((node) => node.getAttribute('data-testid')!.replace('restaurant-dish-', ''))
    .filter((id) => !targetIds.has(id))
  expect(menuIds.length).toBeGreaterThanOrEqual(2)
  fireEvent.click(screen.getByTestId(`restaurant-romaji-${menuIds[0]}`))
  fireEvent.click(screen.getByTestId(`restaurant-romaji-${menuIds[1]}`))
  fireEvent.click(screen.getByRole('button', { name: 'Order' }))
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
  FakeSpeechRecognition.instances = []
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
    expect(screen.getByAltText('Restaurant introduction')).toHaveAttribute('src', expect.stringContaining('restaurant-intro.webp'))
    expect(screen.getByText('and')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByTestId('restaurant-order-template')).toHaveTextContent('すみません、＿＿＿＿ おねがいします。')
    expect(screen.getByAltText('Tamamizu')).toHaveAttribute('src', expect.stringContaining('mascot/order.webp'))
  })

  it.each(['katakana', 'other', 'special-katakana'] as const)('uses sushi and udon in the %s introduction (Issue #158)', (stage) => {
    render(<MemoryRouter><RestaurantPage stage={stage} /></MemoryRouter>)
    expect(screen.getByAltText('すし')).toBeInTheDocument()
    expect(screen.getByAltText('うどん')).toBeInTheDocument()
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
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    clickTargetAnswer()
    expect(screen.getAllByRole('button', { name: /^Hear / }).length).toBeGreaterThanOrEqual(3)
  })

  it('does not consume phantom secondary targets during questions 1 through 4', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    const firstFour: string[] = []
    for (let question = 1; question <= 4; question++) {
      firstFour.push(currentTargetDishes()[0].id)
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    const questionFiveTargets = currentTargetDishes().map((dish) => dish.id)
    expect(new Set(firstFour).size).toBe(4)
    expect(questionFiveTargets).toHaveLength(2)
    expect(questionFiveTargets.every((id) => !firstFour.includes(id))).toBe(true)
  })

  it('keeps every final menu unique, target-complete, shuffled, and different from the previous menu when possible', () => {
    const randomValues = [0.02, 0.71, 0.34, 0.93, 0.18, 0.56, 0.81, 0.27]
    let randomIndex = 0
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues[randomIndex++ % randomValues.length])
    renderPage()
    let previousMenuKey: string | null = null
    const targetPositions = new Set<number>()
    for (let question = 1; question <= 8; question++) {
      const menuIds = [...screen.getByTestId('restaurant-menu').querySelectorAll('[data-testid^="restaurant-dish-"]')]
        .map((node) => node.getAttribute('data-testid')!.replace('restaurant-dish-', ''))
      const targetIds = currentTargetDishes().map((dish) => dish.id)
      expect(menuIds).toHaveLength(4)
      expect(new Set(menuIds).size).toBe(4)
      expect(targetIds.every((id) => menuIds.includes(id))).toBe(true)
      targetIds.forEach((id) => targetPositions.add(menuIds.indexOf(id)))
      const currentMenuKey = [...menuIds].sort().join('|')
      if (previousMenuKey !== null) expect(currentMenuKey).not.toBe(previousMenuKey)
      previousMenuKey = currentMenuKey
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(targetPositions.size).toBeGreaterThan(1)
  })

  it('treats an initial Romaji wrong answer as final and auto-reveals the answer with no Show Answer button', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    clickWrongAnswer()
    expect(mascotSource()).toContain('mascot/incorrect.webp')
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose in Romaji' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument()
    expect(screen.getAllByText('sushi').length).toBeGreaterThan(0)
  })

  it('plays the shared Tamamizu incorrect reaction (not the correct reaction) on a final wrong answer', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    clickWrongAnswer()
    const incorrectCalls = tts.speak.mock.calls.filter(([key]) => typeof key === 'string' && key.startsWith('feedback/'))
    expect(incorrectCalls.length).toBe(1)
    expect(tts.speak).not.toHaveBeenCalledWith('restaurant/staff/kashikomarimashita', 'かしこまりました。')
  })

  it('shows the correct mascot after a correct answer', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    clickTargetAnswer()
    expect(mascotSource()).toContain('mascot/correct.webp')
  })

  it('plays only かしこまりました on a correct answer, never the generic Practice correct reaction', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    clickTargetAnswer()
    expect(tts.speak).toHaveBeenCalledWith('restaurant/staff/kashikomarimashita', 'かしこまりました。')
    const feedbackCalls = tts.speak.mock.calls.filter(([key]) => typeof key === 'string' && key.startsWith('feedback/'))
    expect(feedbackCalls.length).toBe(0)
  })

  it('plays the shared Tamamizu result reaction exactly once when the session completes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    for (let question = 1; question <= 8; question++) {
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('Completed!')).toBeInTheDocument()
    const resultCalls = tts.speak.mock.calls.filter(([key]) => key === 'feedback/kanpeki')
    expect(resultCalls.length).toBe(1)
  })

  it('does not replay the Tamamizu result reaction on an unrelated re-render after completion', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const view = renderPage()
    for (let question = 1; question <= 8; question++) {
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('Completed!')).toBeInTheDocument()
    const countAfterFirstRender = tts.speak.mock.calls.filter(([key]) => key === 'feedback/kanpeki').length
    expect(countAfterFirstRender).toBe(1)
    view.rerender(<MemoryRouter><RestaurantPage /></MemoryRouter>)
    const countAfterRerender = tts.speak.mock.calls.filter(([key]) => key === 'feedback/kanpeki').length
    expect(countAfterRerender).toBe(1)
  })

  it('keeps the session on questions 1 through 7 and shows results after question 8', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    for (let question = 1; question <= 8; question++) {
      clickTargetAnswer()
      if (question < 8) {
        expect(screen.getByText(`Question ${question} / 8`)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      }
    }
    expect(screen.getByText('Completed!')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText('8 of 8 correct')).toBeInTheDocument()
    expect(screen.getByText("Perfect! You're ready to order!")).toBeInTheDocument()
    expect(screen.getByTestId('practice-result-image')).toHaveAttribute('src', expect.stringContaining('summary-results/summary-result-5.webp'))
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument()
  })

  it('counts an auto-revealed final wrong answer as a mistake exactly once before advancing to the final score', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderPage()
    clickWrongAnswer()
    expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    for (let question = 2; question <= 8; question++) {
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('7 of 8 correct')).toBeInTheDocument()
    expect(screen.getByText('Great job! You\'re getting the hang of it!')).toBeInTheDocument()
    expect(screen.getByText('Missed this round (1)')).toBeInTheDocument()
  })
  it('renders without crashing', () => {
    renderPage()
    expect(screen.getByText('Question 1 / 8')).toBeInTheDocument()
  })

  it('keeps the order bubble shrinkable and wraps its two-dish contents', () => {
    renderPage()
    const bubble = screen.getByTestId('restaurant-target-bubble')
    const targetRow = bubble.firstElementChild
    expect(bubble).toHaveClass('min-w-0')
    expect(targetRow).toHaveClass('flex-wrap')
  })

  it('renders the new 3-row visual structure: menu, then Tamamizu bubble, then order template (Issue #160, layout-only)', () => {
    renderPage()
    const menu = screen.getByTestId('restaurant-menu')
    const bubble = screen.getByTestId('restaurant-target-bubble')
    const template = screen.getByTestId('restaurant-order-template')
    expect(menu.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bubble.compareDocumentPosition(template) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps showing the target image/emoji and English up front in the bubble — Restaurant gameplay is unchanged by the layout move (Issue #160)', () => {
    renderPage()
    const bubble = screen.getByTestId('restaurant-target-bubble')
    // Restaurant (unlike Cafe) never hides the target before an answer —
    // this is the same DishGlyph image/placeholder it always rendered, just
    // moved below the menu instead of above it.
    const targetId = currentTargetDishes()[0].id
    expect(screen.getByTestId(`restaurant-target-${targetId}`)).toBeInTheDocument()
    expect(bubble.querySelector('img, [aria-hidden="true"]')).toBeTruthy()
  })

  it('renders a labelled Menu Sheet with a prominent header and restrained frame', () => {
    renderPage()
    const menu = screen.getByTestId('restaurant-menu')
    const title = screen.getByRole('heading', { name: 'メニュー' })
    expect(menu.tagName).toBe('SECTION')
    expect(title).toHaveClass('font-kana')
    expect(title).toHaveClass('text-2xl')
    expect(menu).toHaveAttribute('aria-labelledby', title.id)
    expect(menu).toHaveClass('ring-1', 'ring-inset')
    expect(screen.getByTestId('restaurant-menu-divider')).toHaveClass('border-t')
  })

  it('renders 4 unique dishes with kana, prices, and contained illustrations or placeholder emoji only', () => {
    renderPage()
    const menu = screen.getByTestId('restaurant-menu')
    const rows = [...menu.querySelectorAll('[data-testid^="restaurant-dish-"]')]
    expect(rows).toHaveLength(4)
    const ids = rows.map((row) => row.getAttribute('data-testid')!.replace('restaurant-dish-', ''))
    expect(new Set(ids).size).toBe(4)
    for (const id of ids) {
      const dish = HIRAGANA_RESTAURANT_DISHES.find((candidate) => candidate.id === id)!
      const row = screen.getByTestId(`restaurant-dish-${id}`)
      expect(row).toHaveTextContent(dish.displayKana)
      expect(row).toHaveTextContent(`¥${dish.priceYen}`)
      expect(row).not.toHaveTextContent(dish.romaji)
      expect(row).not.toHaveTextContent(dish.english)
      // Restaurant 1's 7 pending-asset dishes (Issue #158) have no `image`
      // yet and fall back to their placeholder emoji instead of an <img>.
      if (dish.image) {
        expect(row.querySelector('img')).toHaveClass('object-contain')
      } else {
        expect(row.querySelector('img')).toBeNull()
        expect(row).toHaveTextContent(dish.placeholderEmoji)
      }
    }
  })

  it('always includes every current target in the Menu Sheet', () => {
    renderPage()
    const menu = screen.getByTestId('restaurant-menu')
    const targetIds = currentTargetDishes().map((dish) => dish.id)
    for (const id of targetIds) expect(menu.querySelector(`[data-testid="restaurant-dish-${id}"]`)).not.toBeNull()
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

describe('RestaurantPage SpeechRecognition lifecycle', () => {
  function renderWithSpeech() {
    installFakeSpeechRecognition()
    return renderPage()
  }

  function advanceToQuestion5() {
    for (let question = 1; question < 5; question++) {
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('Question 5 / 8')).toBeInTheDocument()
  }

  it('accepts a valid two-dish speech result', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderWithSpeech()
    advanceToQuestion5()
    const recognizer = await startSpeech()
    const [first, second] = currentTargetDishes()
    act(() => recognizer.result({ transcript: `${first.displayKana}と${second.displayKana}おねがいします` }))
    expect(screen.getByText('Great!')).toBeInTheDocument()
  })

  it('accepts a valid two-dish speech result in reverse order', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderWithSpeech()
    advanceToQuestion5()
    const recognizer = await startSpeech()
    const [first, second] = currentTargetDishes()
    act(() => recognizer.result({ transcript: `${second.displayKana}と${first.displayKana}おねがいします` }))
    expect(screen.getByText('Great!')).toBeInTheDocument()
  })

  it('handles an empty results collection without crashing', async () => {
    renderWithSpeech()
    const recognizer = await startSpeech()
    act(() => {
      recognizer.onresult?.({ results: Object.assign([], { length: 0 }) })
      recognizer.end()
    })
    expect(screen.getByText("I couldn't catch that.")).toBeInTheDocument()
  })

  it('handles results[0] being undefined without crashing', async () => {
    renderWithSpeech()
    const recognizer = await startSpeech()
    act(() => {
      recognizer.onresult?.({ results: Object.assign([undefined], { length: 1 }) })
      recognizer.end()
    })
    expect(screen.getByText("I couldn't catch that.")).toBeInTheDocument()
  })

  it('handles a zero-length result without crashing', async () => {
    renderWithSpeech()
    const recognizer = await startSpeech()
    act(() => recognizer.onresult?.({ results: Object.assign([{ length: 0 }], { length: 1 }) }))
    expect(screen.getByText("I couldn't catch that.")).toBeInTheDocument()
  })

  it('handles a malformed recognition alternative without crashing', async () => {
    renderWithSpeech()
    const recognizer = await startSpeech()
    act(() => recognizer.result({ transcript: 42 }))
    expect(screen.getByText("I couldn't catch that.")).toBeInTheDocument()
  })

  it('settles onerror as unrecognized and shows the incorrect mascot', async () => {
    renderWithSpeech()
    const recognizer = await startSpeech()
    act(() => recognizer.error())
    expect(screen.getByText("I couldn't catch that.")).toBeInTheDocument()
    expect(mascotSource()).toContain('mascot/incorrect.webp')
  })

  it('does not let onend overwrite a successful onresult', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderWithSpeech()
    const recognizer = await startSpeech()
    const [target] = currentTargetDishes()
    act(() => {
      recognizer.result({ transcript: `${target.displayKana}おねがいします` })
      recognizer.end()
    })
    expect(screen.getByText('Great!')).toBeInTheDocument()
    expect(screen.queryByText("I couldn't catch that.")).not.toBeInTheDocument()
  })

  it('does not settle again when onend follows onerror', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderWithSpeech()
    const recognizer = await startSpeech()
    const [target] = currentTargetDishes()
    act(() => {
      recognizer.error()
      recognizer.end()
      recognizer.result({ transcript: `${target.displayKana}おねがいします` })
    })
    expect(screen.getByText("I couldn't catch that.")).toBeInTheDocument()
    expect(screen.queryByText('Great!')).not.toBeInTheDocument()
  })

  it('shows the one-time speech rescue controls after a first wrong speech result', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    installFakeSpeechRecognition()
    renderSpeechPage()
    const first = await startSpeech()
    act(() => first.result({ transcript: currentWrongMenuDish().displayKana }))
    expect(screen.getByText("That's not quite it.")).toBeInTheDocument()
    expect(mascotSource()).toContain('mascot/incorrect.webp')
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose in Romaji' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument()
  })

  it('starts exactly one new recognizer immediately when Try Again is clicked', async () => {
    installFakeSpeechRecognition()
    renderSpeechPage()
    const first = await startSpeech()
    act(() => first.error())
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(first.abort).toHaveBeenCalledTimes(1)
    expect(FakeSpeechRecognition.instances).toHaveLength(2)
    const second = FakeSpeechRecognition.instances[1]
    expect(second).not.toBe(first)
    expect(second.start).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('restaurant-speak-button')).toHaveTextContent('Listening')
  })

  it('does not offer another retry after a second speech failure', async () => {
    installFakeSpeechRecognition()
    renderSpeechPage()
    const first = await startSpeech()
    act(() => first.error())
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    act(() => FakeSpeechRecognition.instances[1].error())
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose in Romaji' })).toBeInTheDocument()
  })

  it('recovers successfully through Romaji after both speech attempts fail', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    installFakeSpeechRecognition()
    renderSpeechPage()
    const first = await startSpeech()
    act(() => first.error())
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    const second = FakeSpeechRecognition.instances[1]
    act(() => second.error())
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose in Romaji' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
    clickTargetAnswer()
    expect(screen.getByText('Great!')).toBeInTheDocument()
    finishSessionWithCorrectRomajiAnswers()
    expect(screen.getByText('8 of 8 correct')).toBeInTheDocument()
    expect(screen.getByText("Perfect! You're ready to order!")).toBeInTheDocument()
  })

  it('keeps a recovered retry answer correct in the final summary', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    installFakeSpeechRecognition()
    renderSpeechPage()
    const first = await startSpeech()
    act(() => first.error())
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    const [target] = currentTargetDishes()
    act(() => FakeSpeechRecognition.instances[1].result({ transcript: target.displayKana }))
    expect(screen.getByText('Great!')).toBeInTheDocument()
    finishSessionWithCorrectRomajiAnswers()
    expect(screen.getByText('8 of 8 correct')).toBeInTheDocument()
    expect(screen.getByText("Perfect! You're ready to order!")).toBeInTheDocument()
  })

  it('uses Choose in Romaji rescue after speech failure without recording an interim mistake', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    installFakeSpeechRecognition()
    renderSpeechPage()
    const recognizer = await startSpeech()
    act(() => recognizer.error())
    fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
    expect(screen.getByTestId('restaurant-romaji-fallback')).toBeInTheDocument()
    clickTargetAnswer()
    expect(screen.getByText('Great!')).toBeInTheDocument()
    finishSessionWithCorrectRomajiAnswers()
    expect(screen.getByText('8 of 8 correct')).toBeInTheDocument()
    expect(screen.getByText("Perfect! You're ready to order!")).toBeInTheDocument()
  })

  it('finalizes Show Answer exactly once after a speech failure', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    installFakeSpeechRecognition()
    renderSpeechPage()
    const recognizer = await startSpeech()
    act(() => recognizer.error())
    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }))
    expect(mascotSource()).toContain('mascot/incorrect.webp')
    finishSessionWithCorrectRomajiAnswers()
    expect(screen.getByText('7 of 8 correct')).toBeInTheDocument()
    expect(screen.getByText('Missed this round (1)')).toBeInTheDocument()
  })

  it('finalizes a wrong Romaji rescue by auto-revealing the answer with no Show Answer/Try Again/rescue buttons', async () => {
    installFakeSpeechRecognition()
    renderSpeechPage()
    const recognizer = await startSpeech()
    act(() => recognizer.error())
    fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
    fireEvent.click(screen.getByTestId(`restaurant-romaji-${currentWrongMenuDish().id}`))
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose in Romaji' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument()
    expect(mascotSource()).toContain('mascot/incorrect.webp')
  })

  it('supports the speech-to-Romaji rescue flow for a two-dish question', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    installFakeSpeechRecognition()
    renderSpeechPage()
    for (let question = 1; question < 5; question++) {
      fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
      clickTargetAnswer()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    const recognizer = await startSpeech()
    act(() => recognizer.error())
    fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
    clickTargetAnswer()
    expect(screen.getByText('Great!')).toBeInTheDocument()
  })

  it('recovers a Q5 two-dish question with a successful speech retry', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    installFakeSpeechRecognition()
    renderSpeechPage()
    advanceToQuestion5()
    const first = await startSpeech()
    act(() => first.error())
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(FakeSpeechRecognition.instances).toHaveLength(2)
    expect(currentTargetDishes()).toHaveLength(2)
    const [firstTarget, secondTarget] = currentTargetDishes()
    act(() => FakeSpeechRecognition.instances[1].result({ transcript: `${firstTarget.displayKana}と${secondTarget.displayKana}おねがいします` }))
    expect(screen.getByText('Great!')).toBeInTheDocument()
    finishSessionFromQuestionFive()
    expect(screen.getByText('8 of 8 correct')).toBeInTheDocument()
    expect(screen.getByText("Perfect! You're ready to order!")).toBeInTheDocument()
  })

  it('records exactly one mistake for a wrong Q5 Romaji rescue pair, auto-revealed with no Show Answer button', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    installFakeSpeechRecognition()
    renderSpeechPage()
    advanceToQuestion5()
    const recognizer = await startSpeech()
    act(() => recognizer.error())
    fireEvent.click(screen.getByRole('button', { name: 'Choose in Romaji' }))
    clickWrongTwoDishAnswer()
    expect(mascotSource()).toContain('mascot/incorrect.webp')
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose in Romaji' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument()
    finishSessionFromQuestionFive()
    expect(screen.getByText('Missed this round (1)')).toBeInTheDocument()
  })

  it('ignores an old onresult after Next changes the question', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderWithSpeech()
    const old = await startSpeech()
    clickTargetAnswer()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    const [oldTarget] = HIRAGANA_RESTAURANT_DISHES
    act(() => old.result({ transcript: `${oldTarget.displayKana}おねがいします` }))
    expect(screen.getByText('Question 2 / 8')).toBeInTheDocument()
    expect(screen.queryByText(/I heard:/)).not.toBeInTheDocument()
  })

  it('ignores callbacks after unmount', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const view = renderWithSpeech()
    const recognizer = await startSpeech()
    const [target] = currentTargetDishes()
    view.unmount()
    act(() => {
      recognizer.result({ transcript: `${target.displayKana}おねがいします` })
      recognizer.error()
      recognizer.end()
    })
    expect(recognizer.abort).toHaveBeenCalledTimes(1)
    expect(tts.speak).not.toHaveBeenCalledWith('restaurant/staff/kashikomarimashita', 'かしこまりました。')
  })

  it('ignores callbacks from the failed recognizer after immediate retry', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    installFakeSpeechRecognition()
    renderSpeechPage()
    const first = await startSpeech()
    act(() => first.error())
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    const [target] = currentTargetDishes()
    act(() => first.result({ transcript: target.displayKana }))
    expect(screen.getByTestId('restaurant-speak-button')).toHaveTextContent('Listening')
    act(() => FakeSpeechRecognition.instances[1].result({ transcript: target.displayKana }))
    expect(screen.getByText('Great!')).toBeInTheDocument()
  })

  it('aborts the active recognizer when the question changes', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderWithSpeech()
    const recognizer = await startSpeech()
    clickTargetAnswer()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(recognizer.abort).toHaveBeenCalledTimes(1)
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
    // Whichever outcome, the result panel now settles on the Next control
    // (a wrong answer auto-reveals immediately, so there's no separate
    // "Show Answer" affordance to wait for any more).
    expect(await screen.findByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(snapshotProgress()).toBe(before.progress)
    expect(snapshotSaved()).toBe(before.saved)
  })

  it('a simulated speech recognition error does not change progress/saved store state', async () => {
    installFakeSpeechRecognition()

    const before = { progress: snapshotProgress(), saved: snapshotSaved() }
    renderPage()
    const speakButton = await screen.findByTestId('restaurant-speak-button')
    speakButton.click()
    act(() => FakeSpeechRecognition.instances[0].error())
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
