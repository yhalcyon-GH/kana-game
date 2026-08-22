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
  // character Review (lib/srs.ts's applyReviewResult), so a misattributed
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
    // target1 was placed correctly and must NOT enter character Review,
    // regardless of the whole word being wrong overall (slot 0 was wrong).
    // target0 was actually wrong and must enter Review (active, streak 0).
    expect(chars[target1]?.reviewActive ?? false).toBe(false)
    expect(chars[target0]).toMatchObject({ reviewActive: true, reviewStreak: 0 })
  })
})

const MEANING_TO_GLYPHS: Record<string, [string, string]> = { love: ['あ', 'い'], house: ['い', 'え'] }

function finishVisibleWordBuilderSessionKeepingHouseWeak(container: HTMLElement) {
  const trayButtons = () => Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed)')) as HTMLButtonElement[]

  for (let round = 0; round < 6; round++) {
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const [firstGlyph, secondGlyph] = MEANING_TO_GLYPHS[meaning]
    const firstTile =
      meaning === 'love'
        ? trayButtons().find((button) => button.textContent === firstGlyph)!
        : trayButtons().find((button) => button.textContent !== firstGlyph && button.textContent !== secondGlyph)!
    const secondTile = trayButtons().find((button) => button.textContent === secondGlyph)!

    act(() => fireEvent.click(firstTile))
    act(() => fireEvent.click(secondTile))
    if (meaning === 'love') {
      act(() => vi.advanceTimersByTime(2000))
    } else {
      const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Next'))!
      act(() => fireEvent.click(next))
    }
  }
}

describe('WordBuilderPage Review session', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')
    // Two weak words (via a miss each) so the live Review pool stays
    // non-empty after the first one graduates out below.
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    useProgressStore.getState().recordWordReviewResult('a-ie', false)
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

  it('Play Again captures the Review pool that is current after the completed attempt', () => {
    vi.useFakeTimers()
    const { container, getByRole } = render(
      <MemoryRouter initialEntries={['/practice/review/word-builder']}>
        <Routes>
          <Route path="/practice/review/word-builder" element={<WordBuilderPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )

    finishVisibleWordBuilderSessionKeepingHouseWeak(container)
    // "love" gets answered correctly on each of its 3 occurrences, so it
    // graduates out of word Review after its first 2; "house" is answered
    // wrong every time, so it stays active. Word Review is independent of
    // character Review (Issue #2), so no character-level cleanup is needed
    // to isolate the one remaining weak word.
    expect(getByRole('button', { name: /play again/i })).toBeInTheDocument()

    act(() => {
      fireEvent.click(getByRole('button', { name: /play again/i }))
    })

    expect(container.querySelector('p.text-sm')?.textContent).toMatch('Round 1 / 3')
  })
})

describe('WordBuilderPage Review empty state', () => {
  it('shows a success state instead of a blank page when nothing is active in word Review', () => {
    useProgressStore.getState().resetProgress()
    useProgressStore.getState().markRowTaught('a-row')

    const { container } = render(
      <MemoryRouter initialEntries={['/practice/review/word-builder']}>
        <Routes>
          <Route path="/practice/review/word-builder" element={<WordBuilderPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(container.textContent).toMatch(/Review complete!/)
  })
})
