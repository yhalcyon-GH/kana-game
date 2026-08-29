import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { WORDS_BY_ID } from '../../data/words'
import { getNextRowId, ROWS } from '../../data/curriculum'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { useSavedItemsStore } from '../../store/savedItemsStore'
import { buildFlatTargetTiles, displayGlyphsForCharId } from '../../lib/wordBuilderTiles'
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

// The completed-session summary shows the real played correct/total count
// as a compact "{correct}/{total}" score (see PracticeSummary) instead of a
// computed Accuracy/"N / M correct" stat or the old "{total}問中{correct}問
// 正解" text — see "fix: redesign practice result summary".
describe('WordBuilderPage result summary (correct/total count)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // Fills every empty slot with tray tiles (mode-agnostic, like
  // clickThroughWordBuilderRound) and tallies real correctness from the
  // DOM: a correct round auto-advances (no actionable Next button — see
  // this page's per-character-attribution tests above), a wrong one shows
  // one.
  function playSessionTallyingCorrectness(container: HTMLElement, rounds: number): number {
    const availableTrayButtons = () =>
      Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed):not([disabled])')) as HTMLButtonElement[]
    const emptySlotCount = () =>
      Array.from(container.querySelectorAll('button.border-dashed span.font-kana')).filter((s) => !s.textContent).length

    let correct = 0
    for (let round = 0; round < rounds; round++) {
      let guard = 0
      while (emptySlotCount() > 0 && guard < 10) {
        const next = availableTrayButtons()[0]
        if (!next) break
        act(() => fireEvent.click(next))
        guard += 1
      }
      const nextButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))
      if (nextButton) {
        act(() => fireEvent.click(nextButton))
      } else {
        correct += 1
        act(() => vi.advanceTimersByTime(2000))
      }
    }
    return correct
  }

  it('shows the actual correct count out of the actual played total for a normal 8-question session', () => {
    vi.useFakeTimers()
    const { container } = renderRowWordBuilder()
    const correct = playSessionTallyingCorrectness(container, 8)
    expect(container.textContent).toContain(`${correct}/8`)
    expect(container.textContent).not.toMatch(/問中/)
    expect(container.textContent).not.toMatch(/問正解/)
    expect(container.textContent).not.toMatch(/その調子/)
    expect(container.textContent).not.toMatch(/Accuracy/i)
    expect(container.textContent).not.toMatch(/%/)
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+\s*correct/i)
  })

  it('a shorter Review session shows the actual (non-8) played total, not a fixed session length', () => {
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

    const availableTrayButtons = () =>
      Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed):not([disabled])')) as HTMLButtonElement[]
    const emptySlotCount = () =>
      Array.from(container.querySelectorAll('button.border-dashed span.font-kana')).filter((s) => !s.textContent).length

    let guard = 0
    let correct = 0
    while (!container.textContent?.includes('complete!') && guard < 20) {
      let fillGuard = 0
      while (emptySlotCount() > 0 && fillGuard < 10) {
        const next = availableTrayButtons()[0]
        if (!next) break
        act(() => fireEvent.click(next))
        fillGuard += 1
      }
      const nextButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))
      if (nextButton) {
        act(() => fireEvent.click(nextButton))
      } else {
        correct += 1
        act(() => vi.advanceTimersByTime(2000))
      }
      guard += 1
    }

    expect(container.textContent).toMatch(/complete!/)
    expect(container.textContent).toMatch(new RegExp(`${correct}/\\d`))
    expect(container.textContent).not.toMatch(/\/8\b/)
  })
})

const A_ROW_MEANING_TO_ROMAJI: Record<string, string> = { love: 'ai', house: 'ie', 'up / above': 'ue', blue: 'ao' }

describe('WordBuilderPage romaji hint (Issue #19)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides the target romaji at question start when alwaysShowRomajiHints is OFF, with no reveal button', () => {
    const { container, queryByText } = renderRowWordBuilder()
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    expect(queryByText(A_ROW_MEANING_TO_ROMAJI[meaning])).toBeNull()
    expect(queryByText('Show romaji')).toBeNull()
  })

  it('shows the target romaji from the start when alwaysShowRomajiHints is ON, with no "Show romaji" button', () => {
    useProgressStore.getState().setAlwaysShowRomajiHints(true)
    const { container, queryByText } = renderRowWordBuilder()
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    expect(queryByText(A_ROW_MEANING_TO_ROMAJI[meaning])).not.toBeNull()
    expect(queryByText('Show romaji')).toBeNull()
  })

  it('the same rule applies to Review-scoped Word Builder', () => {
    useProgressStore.getState().markRowTaught('a-row')
    useProgressStore.getState().recordWordReviewResult('a-ai', false)
    const { container, queryByText } = render(
      <MemoryRouter initialEntries={['/practice/review/word-builder']}>
        <Routes>
          <Route path="/practice/review/word-builder" element={<WordBuilderPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    expect(queryByText(A_ROW_MEANING_TO_ROMAJI[meaning])).toBeNull()
    expect(queryByText('Show romaji')).toBeNull()
  })
})

// Pre-answer mascot state (see "fix: show thinking mascot before
// answering") — before the learner places every tile, Tamamizu shows the
// "thinking" artwork (mood 'normal' -> mascot/normal.webp); after
// answering, the existing correct/incorrect reaction still takes over.
describe('WordBuilderPage pre-answer mascot', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the thinking mascot (mascot/normal.webp) before the learner fills every slot', () => {
    const { container } = renderRowWordBuilder()
    const mascotImg = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotImg).not.toBeNull()
    expect(mascotImg.src).toContain('mascot/normal.webp')
  })

  it('switches to a reaction mascot after answering, and back to normal on the next round', () => {
    vi.useFakeTimers()
    const { container } = renderRowWordBuilder()

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

    const mascotAfterAnswer = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotAfterAnswer.src).not.toContain('mascot/normal.webp')

    const next = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))
    if (next) {
      act(() => fireEvent.click(next))
    } else {
      act(() => vi.advanceTimersByTime(2000))
    }
    const mascotNextRound = container.querySelector('img[src*="mascot"]') as HTMLImageElement
    expect(mascotNextRound.src).toContain('mascot/normal.webp')
  })
})

// Saved items (see savedItemsStore.ts) — Word Builder shows a Save checkbox
// for the target WORD (never an individual character) only after a wrong
// answer, never on a correct one.
describe('WordBuilderPage: Save checkbox on wrong answer only', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress()
    useSavedItemsStore.setState({ savedCharacterIds: [], savedWordIds: [] })
  })

  const glyphOf = (id: string) => ({ a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' })[id]!

  it('does not show a Save checkbox before answering', () => {
    const { queryByRole } = renderRowWordBuilder()
    expect(queryByRole('checkbox')).toBeNull()
  })

  it('shows a Save checkbox for the target word after a wrong answer, and saving it saves only the word, not its individual characters', () => {
    const { container, getByRole } = renderRowWordBuilder()
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const [target0, target1] = A_ROW_WORDS[meaning]

    const trayButtons = () =>
      Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed):not([disabled])')) as HTMLButtonElement[]
    const wrongTile = trayButtons().find((b) => b.textContent !== glyphOf(target0) && b.textContent !== glyphOf(target1))!
    fireEvent.click(wrongTile)
    const secondTile = trayButtons()[0]
    fireEvent.click(secondTile)

    const checkbox = getByRole('checkbox') as HTMLInputElement
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(useSavedItemsStore.getState().savedWordIds.length).toBe(1)
    // Word Builder tracks per-character correctness for Review, but Saved
    // must only ever record the whole target word — never auto-add either
    // of its individual characters.
    expect(useSavedItemsStore.getState().savedCharacterIds).toEqual([])
  })

  it('does not show a Save checkbox after a correct answer', () => {
    const { container, queryByRole } = renderRowWordBuilder()
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const [target0, target1] = A_ROW_WORDS[meaning]

    const trayButtons = () => Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed)')) as HTMLButtonElement[]
    fireEvent.click(trayButtons().find((b) => b.textContent === glyphOf(target0))!)
    fireEvent.click(trayButtons().find((b) => b.textContent === glyphOf(target1))!)

    expect(queryByRole('checkbox')).toBeNull()
  })
})

// Special Katakana spelling-tile split (item 3 of "finish Special Katakana
// learning polish") — the character id stays ONE Review/SRS/recognition
// target, but Word Builder renders it as two display tiles (full kana +
// small vowel). See SPECIAL_KATAKANA_SPLIT_IDS in WordBuilderPage.tsx.
describe('WordBuilderPage Special Katakana spelling-tile split', () => {
  const SPLIT_COMBOS: [string, [string, string]][] = [
    ['katakana-fa', ['フ', 'ァ']],
    ['katakana-fi', ['フ', 'ィ']],
    ['katakana-fe', ['フ', 'ェ']],
    ['katakana-fo', ['フ', 'ォ']],
    ['katakana-ti', ['テ', 'ィ']],
    ['katakana-di', ['デ', 'ィ']],
    ['katakana-she', ['シ', 'ェ']],
    ['katakana-je', ['ジ', 'ェ']],
    ['katakana-che', ['チ', 'ェ']],
    ['katakana-wi', ['ウ', 'ィ']],
    ['katakana-we', ['ウ', 'ェ']],
    ['katakana-special-wo', ['ウ', 'ォ']],
  ]

  it.each(SPLIT_COMBOS)('%s splits into its two component glyphs', (charId, expected) => {
    expect(displayGlyphsForCharId(charId)).toEqual(expected)
  })

  it('yōon (キャ/シュ/チャ) stays a single unsplit tile', () => {
    expect(displayGlyphsForCharId('katakana-kya')).toEqual(['キャ'])
    expect(displayGlyphsForCharId('katakana-shu')).toEqual(['シュ'])
    expect(displayGlyphsForCharId('katakana-cha')).toEqual(['チャ'])
  })

  it('ファン (fan) tiles as [フ][ァ][ン]', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-fa-fan'].characterIds).map((t) => t.glyph)).toEqual([
      'フ',
      'ァ',
      'ン',
    ])
  })

  it('ティッシュ (tissue) tiles as [テ][ィ][ッ][シュ]', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-fa-tisshu'].characterIds).map((t) => t.glyph)).toEqual([
      'テ',
      'ィ',
      'ッ',
      'シュ',
    ])
  })

  it('キャンディー (candy) tiles as [キャ][ン][デ][ィ][ー] — キャ stays whole', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-fa-kyandii'].characterIds).map((t) => t.glyph)).toEqual([
      'キャ',
      'ン',
      'デ',
      'ィ',
      'ー',
    ])
  })

  it('ジェスチャー (gesture) tiles as [ジ][ェ][ス][チャ][ー] — チャ stays whole', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-she-jesuchaa'].characterIds).map((t) => t.glyph)).toEqual([
      'ジ',
      'ェ',
      'ス',
      'チャ',
      'ー',
    ])
  })

  it('ハロウィン (Halloween) tiles as [ハ][ロ][ウ][ィ][ン]', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-she-harowin'].characterIds).map((t) => t.glyph)).toEqual([
      'ハ',
      'ロ',
      'ウ',
      'ィ',
      'ン',
    ])
  })

  it('ウォーキング (walking) tiles as [ウ][ォ][ー][キ][ン][グ]', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-she-wookingu'].characterIds).map((t) => t.glyph)).toEqual([
      'ウ',
      'ォ',
      'ー',
      'キ',
      'ン',
      'グ',
    ])
  })

  it('a wrong placement on either split half of a Special Katakana tile records exactly one wrong result against the combined charId', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/special-katakana/special-katakana-fa-row/word-builder']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/word-builder" element={<WordBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const trayButtons = () =>
      Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed):not([disabled])')) as HTMLButtonElement[]
    const emptySlotCount = () =>
      Array.from(container.querySelectorAll('button.border-dashed span.font-kana')).filter((s) => !s.textContent).length

    // Fill every slot with whatever tile is available first — guaranteed to
    // produce at least one wrong placement in a row with distractors, and we
    // only assert the INVARIANT (never a bogus per-glyph target), not which
    // specific character ends up wrong.
    let guard = 0
    while (emptySlotCount() > 0 && guard < 10) {
      const next = trayButtons()[0]
      if (!next) break
      act(() => fireEvent.click(next))
      guard += 1
    }

    const characters = useProgressStore.getState().characters
    // Every reviewActive character id after this round must be a real,
    // known learning-unit id (from CHARACTERS_BY_ID) — never a synthetic
    // split-half id, which would mean the split leaked into Review/SRS
    // attribution instead of being folded back into its combined charId.
    for (const [id, state] of Object.entries(characters)) {
      if (state?.reviewActive) expect(CHARACTERS_BY_ID[id]).toBeDefined()
    }
  })
})
