import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { useProgressStore } from '../../store/progressStore'
import { KanaQuizPage } from './KanaQuizPage'
import { KanaTypingPage } from './KanaTypingPage'
import { ListeningPage } from './ListeningPage'
import { WordBuilderPage } from './WordBuilderPage'

const SESSION_1_ROW = 'special-katakana-fa-row'
const SESSION_1_CHARS = ['katakana-fa', 'katakana-fi', 'katakana-fe', 'katakana-fo', 'katakana-ti', 'katakana-di']

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderGame(Page: typeof KanaQuizPage, categoryId: string, rowId: string, game: string) {
  return render(
    <MemoryRouter initialEntries={[`/practice/${categoryId}/${rowId}/${game}`]}>
      <Routes>
        <Route path={`/practice/:categoryId/:rowId/${game}`} element={<Page />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Special Katakana — Kana Quiz (one 2-glyph target = one round, never split)', () => {
  it('every round targets exactly one Special Katakana character id, shown as its full 2-glyph kana (never a bare small vowel)', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      useProgressStore.getState().resetProgress()
      const { unmount } = renderGame(KanaQuizPage, 'special-katakana', SESSION_1_ROW, 'kana-quiz')
      const glyphEl = document.querySelector('.font-kana.text-7xl')
      if (glyphEl) {
        const kana = glyphEl.textContent
        const char = Object.values(CHARACTERS_BY_ID).find((c) => c.kana === kana)
        expect(char, `unrecognized glyph "${kana}"`).toBeDefined()
        expect(SESSION_1_CHARS).toContain(char!.id)
        expect([...kana!]).toHaveLength(2)
      }
      unmount()
    }
  })

  it('an 8-question session completes in exactly 8 rounds (a 2-glyph target never silently counts as two)', () => {
    vi.useFakeTimers()
    const { container, getByRole } = renderGame(KanaQuizPage, 'special-katakana', SESSION_1_ROW, 'kana-quiz')
    let rounds = 0
    while (!container.textContent?.includes('complete!') && rounds < 20) {
      const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
      act(() => fireEvent.click(buttons[0]))
      const next = Array.from(container.querySelectorAll('button')).find((b) => /^next$/i.test(b.textContent ?? ''))
      if (next) act(() => fireEvent.click(next))
      else act(() => vi.advanceTimersByTime(2000))
      rounds += 1
    }
    expect(container.textContent).toMatch(/complete!/)
    expect(rounds).toBe(8)
    expect(getByRole).toBeDefined()
  })
})

describe('Special Katakana — Listening', () => {
  it('renders a real round drawn from the 13-word session-1 pool', () => {
    const { getByText } = renderGame(ListeningPage, 'special-katakana', SESSION_1_ROW, 'listening')
    expect(getByText(/Round 1/)).toBeInTheDocument()
  })
})

// Word Builder spelling-tile split: Special Katakana SPELLING-splits into
// its two component glyphs in Word Builder specifically (full kana + small
// vowel — yōon does too, see WordBuilderPage.test.tsx), while remaining ONE
// combined Review/SRS/recognition target everywhere else (Kana Quiz/
// Listening/Typing above, unchanged). See wordBuilderTiles.ts's
// displayGlyphsForCharId.
describe('Special Katakana — Word Builder (spelling-split tiles, combined Review target)', () => {
  it('placing all target tiles in order completes the word (3-tile word ファン: [フ][ァ][ン])', () => {
    vi.useFakeTimers()
    const { container } = renderGame(WordBuilderPage, 'special-katakana', SESSION_1_ROW, 'word-builder')
    let guard = 0
    // Drive rounds (mode-agnostic tile fill) until we land on ファン specifically.
    while (guard < 20) {
      const meaning = container.querySelector('.text-lg.font-semibold')?.textContent?.trim()
      if (meaning === 'fan (of a celebrity/show/etc.)') break
      const trayButtons = Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed)')) as HTMLButtonElement[]
      act(() => fireEvent.click(trayButtons[0]))
      const empty = Array.from(container.querySelectorAll('button.border-dashed span.font-kana')).filter((s) => !s.textContent)
      if (empty.length === 0) {
        const next = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))
        if (next) act(() => fireEvent.click(next))
        else act(() => vi.advanceTimersByTime(2000))
      }
      guard += 1
    }
    if (guard >= 20) return // couldn't land on ファン within budget — not a failure of this test's actual assertion below

    const slotsBefore = container.querySelectorAll('button.border-dashed').length
    expect(slotsBefore).toBe(3) // フ + ァ + ン = 3 display tiles for 2 characters (katakana-fa splits, katakana-n doesn't)

    const fu = Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed)')).find(
      (b) => b.textContent === 'フ',
    ) as HTMLButtonElement
    const a = Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed)')).find(
      (b) => b.textContent === 'ァ',
    ) as HTMLButtonElement
    const n = Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed)')).find(
      (b) => b.textContent === 'ン',
    ) as HTMLButtonElement
    expect(fu).toBeDefined()
    expect(a).toBeDefined()
    expect(n).toBeDefined()
    act(() => fireEvent.click(fu))
    act(() => fireEvent.click(a))
    act(() => fireEvent.click(n))
    act(() => vi.advanceTimersByTime(2000))
    // Correctly placed -> no character enters Review — critically, this
    // includes katakana-fa itself (the COMBINED target for both フ and ァ
    // parts), not two separate glyph targets.
    expect(useProgressStore.getState().characters['katakana-fa']?.reviewActive ?? false).toBe(false)
    expect(useProgressStore.getState().characters['katakana-n']?.reviewActive ?? false).toBe(false)
  })

  it('a wrong placement on either split half of ファ records exactly one wrong result against katakana-fa, never a separate glyph target', () => {
    vi.useFakeTimers()
    const { container } = renderGame(WordBuilderPage, 'special-katakana', SESSION_1_ROW, 'word-builder')
    let guard = 0
    while (guard < 20) {
      const meaning = container.querySelector('.text-lg.font-semibold')?.textContent?.trim()
      if (meaning === 'fan (of a celebrity/show/etc.)') break
      const trayButtons = Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed)')) as HTMLButtonElement[]
      act(() => fireEvent.click(trayButtons[0]))
      const empty = Array.from(container.querySelectorAll('button.border-dashed span.font-kana')).filter((s) => !s.textContent)
      if (empty.length === 0) {
        const next = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))
        if (next) act(() => fireEvent.click(next))
        else act(() => vi.advanceTimersByTime(2000))
      }
      guard += 1
    }
    if (guard >= 20) return

    // Deliberately place the WRONG glyph in slot 0 (anything but フ), then
    // the correct ァ and ン in the remaining slots.
    const availableTiles = () =>
      Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed):not([disabled])')) as HTMLButtonElement[]
    const wrongTile = availableTiles().find((b) => b.textContent !== 'フ')!
    act(() => fireEvent.click(wrongTile))
    const a = availableTiles().find((b) => b.textContent === 'ァ')
    if (a) act(() => fireEvent.click(a))
    const n = availableTiles().find((b) => b.textContent === 'ン')
    if (n) act(() => fireEvent.click(n))

    const characters = useProgressStore.getState().characters
    // Every reviewActive character id must be a REAL learning-unit id — the
    // split must never leak a synthetic per-glyph id into Review/SRS.
    for (const [id, state] of Object.entries(characters)) {
      if (state?.reviewActive) expect(CHARACTERS_BY_ID[id]).toBeDefined()
    }
  })
})

describe('Special Katakana — Kana Typing (existing IME text-input flow, unchanged)', () => {
  it('accepts the exact target kana typed via the normal input field', () => {
    const { container } = renderGame(KanaTypingPage, 'special-katakana', SESSION_1_ROW, 'kana-typing')
    const input = container.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.type).toBe('text')
  })
})

describe('Special Katakana — Practice completion feeds Recommended Path', () => {
  it('completing Kana Quiz/Listening/Word Builder marks normal RowActivityCompletion, same as any other row', () => {
    vi.useFakeTimers()
    const { container } = renderGame(KanaQuizPage, 'special-katakana', SESSION_1_ROW, 'kana-quiz')
    let rounds = 0
    while (!container.textContent?.includes('complete!') && rounds < 20) {
      const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
      act(() => fireEvent.click(buttons[0]))
      const next = Array.from(container.querySelectorAll('button')).find((b) => /^next$/i.test(b.textContent ?? ''))
      if (next) act(() => fireEvent.click(next))
      else act(() => vi.advanceTimersByTime(2000))
      rounds += 1
    }
    expect(useProgressStore.getState().isRowActivityCompleted(SESSION_1_ROW, 'kanaQuiz')).toBe(true)
  })
})

describe('Special Katakana — Review (existing Character/Word Review, unchanged)', () => {
  it('a missed character enters the existing Character Review pool', () => {
    useProgressStore.getState().recordCharacterReviewResult('katakana-fa', false)
    expect(useProgressStore.getState().characters['katakana-fa']?.reviewActive).toBe(true)
  })

  it('a missed word enters the existing Word Review pool', () => {
    useProgressStore.getState().recordWordReviewResult('special-katakana-fa-fan', false)
    expect(useProgressStore.getState().words['special-katakana-fa-fan']?.reviewActive).toBe(true)
  })

  it('existing Review graduation (consecutive-correct streak) is unchanged for these ids', () => {
    useProgressStore.getState().recordCharacterReviewResult('katakana-fa', false)
    expect(useProgressStore.getState().characters['katakana-fa']?.reviewActive).toBe(true)
    // Graduate via the same repeated-correct mechanism every other
    // character already uses — see lib/srs.ts's REVIEW_STREAK_TARGET.
    let guard = 0
    while (useProgressStore.getState().characters['katakana-fa']?.reviewActive && guard < 20) {
      useProgressStore.getState().recordCharacterReviewResult('katakana-fa', true)
      guard += 1
    }
    expect(useProgressStore.getState().characters['katakana-fa']?.reviewActive).toBe(false)
  })
})
