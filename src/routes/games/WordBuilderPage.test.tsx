import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { WordBuilderPage } from './WordBuilderPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

// a-row's 4 words, each 2 characters — used to map the rendered "meaning"
// text back to the actual target characterIds, since which word appears is
// randomized by useGameSession's weighted queue.
const A_ROW_WORDS: Record<string, [string, string]> = {
  love: ['a', 'i'],
  house: ['i', 'e'],
  'up / above': ['u', 'e'],
  blue: ['a', 'o'],
}

describe('WordBuilderPage per-character attribution', () => {
  // Regression test: recordResult used to be called with the whole WORD's
  // correctness for every character in it, so a single wrong glyph marked
  // every character in the word wrong — including ones placed correctly.
  // That was harmless while it only fed the SRS box, but now drives
  // Review's Weak Kana list (lib/srs.ts's needsReview), so a misattributed
  // character would show up there as "kept missing" when it wasn't.
  it('a wrong glyph in one slot does not mark a correctly-placed character as wrong too', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row/word-builder']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/word-builder" element={<WordBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const meaningEl = container.querySelector('.text-lg.font-semibold')
    const meaning = meaningEl!.textContent!.trim()
    const [target0, target1] = A_ROW_WORDS[meaning]
    expect(target0).toBeDefined()

    const trayButtons = () => Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed)')) as HTMLButtonElement[]
    const glyphOf = (id: string) => ({ a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' })[id]

    // Slot 0: deliberately WRONG — click a tile that's neither target's
    // glyph (never target1's, so its own tile stays free for the next step).
    const wrongTile = trayButtons().find((b) => b.textContent !== glyphOf(target0) && b.textContent !== glyphOf(target1))!
    fireEvent.click(wrongTile)
    // Slot 1: deliberately CORRECT — click target1's own glyph tile.
    const correctTile = trayButtons().find((b) => b.textContent === glyphOf(target1))!
    fireEvent.click(correctTile)

    const chars = useProgressStore.getState().characters
    // target1 was placed correctly and must be recorded correct, regardless
    // of the whole word being wrong overall (slot 0 was wrong) — its
    // reviewScore should have dropped (clamped at 0), not risen.
    expect(chars[target1]?.reviewScore ?? 0).toBe(0)
    expect(chars[target0]?.reviewScore).toBe(5)
  })
})

const MEANING_TO_GLYPHS: Record<string, [string, string]> = { love: ['あ', 'い'], house: ['い', 'え'] }

describe('WordBuilderPage Review session', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
    // Two weak words so the live Review pool stays non-empty (no "nothing
    // weak" fallback) after the first one drops out below.
    useProgressStore.getState().adjustWordReviewScore('a-ai', 5)
    useProgressStore.getState().adjustWordReviewScore('a-ie', 5)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Same regression as KanaTypingPage/ListeningPage: answering the first
  // weak word correctly drops it below the weak threshold and removes it
  // from Review's live pool. WordBuilderPage's own setTimeout(advance, 2000)
  // happens to get cancelled via its useEffect cleanup when the round
  // actually changes, but this test locks in that the round still ends up
  // resolving correctly end-to-end rather than relying on that as an
  // unverified implementation detail.
  it('answering the first weak word correctly advances exactly one round, not two', () => {
    vi.useFakeTimers()
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/review/word-builder']}>
        <Routes>
          <Route path="/practice/review/word-builder" element={<WordBuilderPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )

    const roundText = () => container.querySelector('p')!.textContent!
    const meaningText = () => container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const trayButtons = () => Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed)')) as HTMLButtonElement[]

    expect(roundText()).toMatch('Round 1 / 6')
    const [g0, g1] = MEANING_TO_GLYPHS[meaningText()]
    expect(g0).toBeDefined()

    act(() => {
      fireEvent.click(trayButtons().find((b) => b.textContent === g0)!)
    })
    act(() => {
      fireEvent.click(trayButtons().find((b) => b.textContent === g1)!)
    })

    // The correct-answer timer hasn't fired yet — must not have advanced yet.
    expect(roundText()).toMatch('Round 1 / 6')

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Exactly one round advanced, and the new round is genuinely playable.
    expect(roundText()).toMatch('Round 2 / 6')
    expect(meaningText()).not.toBe('')
    expect(trayButtons().length).toBeGreaterThan(0)
  })
})
