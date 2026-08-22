import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNextRowId, ROWS } from '../../data/curriculum'
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

function renderRowWordBuilder() {
  return render(
    <MemoryRouter initialEntries={['/practice/hiragana/a-row/word-builder']}>
      <Routes>
        <Route path="/practice/:categoryId/:rowId/word-builder" element={<WordBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Mode-agnostic round driver (doesn't care about correctness) — fills every
// empty slot by clicking tray tiles one at a time (word length varies), then
// clears the round via whichever path evaluation lands on.
function clickThroughWordBuilderRound(container: HTMLElement) {
  const availableTrayButtons = () =>
    Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed):not([disabled])')) as HTMLButtonElement[]
  const emptySlotCount = () =>
    Array.from(container.querySelectorAll('button.border-dashed span.font-kana')).filter((s) => !s.textContent).length

  let guard = 0
  while (emptySlotCount() > 0 && guard < 10) {
    const next = availableTrayButtons()[0]
    if (!next) break
    act(() => fireEvent.click(next))
    guard += 1
  }

  const next = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))
  if (next) {
    act(() => fireEvent.click(next))
  } else {
    act(() => vi.advanceTimersByTime(2000))
  }
}

describe('WordBuilderPage Recommended Path completion (Issue #11)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('completing a normal session marks wordBuilder completed, regardless of accuracy', () => {
    vi.useFakeTimers()
    const { container } = renderRowWordBuilder()
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'wordBuilder')).toBe(false)
    for (let round = 0; round < 8; round++) clickThroughWordBuilderRound(container)
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'wordBuilder')).toBe(true)
  })

  it('merely opening the game does not mark completion', () => {
    renderRowWordBuilder()
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'wordBuilder')).toBe(false)
  })

  it('answering only part of a session does not mark completion', () => {
    vi.useFakeTimers()
    const { container } = renderRowWordBuilder()
    clickThroughWordBuilderRound(container)
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'wordBuilder')).toBe(false)
  })

  it('a Review-scoped session completing does not mark normal-row completion', () => {
    vi.useFakeTimers()
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/review/word-builder']}>
        <Routes>
          <Route path="/practice/review/word-builder" element={<WordBuilderPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )
    let guard = 0
    while (!container.textContent?.includes('complete!') && guard < 20) {
      clickThroughWordBuilderRound(container)
      guard += 1
    }
    expect(container.textContent).toMatch(/complete!/)
    expect(useProgressStore.getState().isRowActivityCompleted('a-row', 'wordBuilder')).toBe(false)
  })

  it('the normal summary offers Continue to the next row\'s hub', () => {
    vi.useFakeTimers()
    const { container, getByRole } = renderRowWordBuilder()
    for (let round = 0; round < 8; round++) clickThroughWordBuilderRound(container)
    // a-row -> ka-row is the next row in the hiragana sequence.
    const continueLink = getByRole('link', { name: /continue/i })
    expect(continueLink).toHaveAttribute('href', '/practice/hiragana/ka-row')
  })

  it('does not render a broken Continue action on the final row (no next row exists)', () => {
    vi.useFakeTimers()
    const lastRow = ROWS.find((r) => !r.isSummary && getNextRowId(r.id) === null)!
    expect(lastRow).toBeDefined()
    const { container, queryByRole } = render(
      <MemoryRouter initialEntries={[`/practice/${lastRow.categoryId}/${lastRow.id}/word-builder`]}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/word-builder" element={<WordBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    )
    let guard = 0
    while (!container.textContent?.includes('complete!') && guard < 20) {
      clickThroughWordBuilderRound(container)
      guard += 1
    }
    expect(container.textContent).toMatch(/complete!/)
    expect(queryByRole('link', { name: /continue/i })).toBeNull()
    expect(queryByRole('link', { name: /back to hub/i })).not.toBeNull()
  })
})
