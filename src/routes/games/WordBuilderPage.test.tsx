import { act, fireEvent, render, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { WORDS_BY_ID, WORDS_BY_ROW } from '../../data/words'
import { getNextRowId, ROWS } from '../../data/curriculum'
import { PRACTICE_CHECKPOINTS } from '../../data/practiceCheckpoints'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { useSavedItemsStore } from '../../store/savedItemsStore'
import { buildFlatTargetTiles, displayGlyphsForCharId } from '../../lib/wordBuilderTiles'
import { WordBuilderPage } from './WordBuilderPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

// a-row's 5 words (Issue #155 added えん/'yen' alongside ん), each 2
// characters — used to map the rendered "meaning" text back to the actual
// target characterIds, since which word appears is randomized by
// useGameSession's weighted queue.
const A_ROW_WORDS: Record<string, [string, string]> = {
  love: ['a', 'i'],
  house: ['i', 'e'],
  'up / above': ['u', 'e'],
  blue: ['a', 'o'],
  yen: ['e', 'n'],
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
    const glyphOf = (id: string) => ({ a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お', n: 'ん' })[id]

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

  it('on a row with no next row but an approved checkpoint (Issue #183), Continue goes to that checkpoint rather than being broken', () => {
    vi.useFakeTimers()
    const lastRow = ROWS.find((r) => !r.isSummary && !r.isSimilarLetters && getNextRowId(r.id) === null)!
    expect(lastRow).toBeDefined()
    // Every row with no next row in its own category currently has an
    // approved Restaurant/Cafe checkpoint after it (Issue #183) — Word
    // Builder's Continue prefers that checkpoint over next-row navigation,
    // so this is never actually a dead end. See recommendedPath.ts and
    // src/data/practiceCheckpoints.ts.
    const checkpoint = PRACTICE_CHECKPOINTS.find((c) => c.afterRowId === lastRow.id)
    expect(checkpoint).toBeDefined()
    const { container, getByRole } = render(
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
    const continueLink = getByRole('link', { name: /continue/i })
    expect(continueLink).toHaveAttribute('href', checkpoint!.routePath)
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
  // DOM. Next now renders on BOTH correct and wrong rounds (see
  // AnswerFeedbackRow's showNext), so correctness is read from whether the
  // Save toggle (wrong-only) appears, not from Next's presence.
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
      const isWrong = !!container.querySelector('input[type="checkbox"]')
      if (!isWrong) correct += 1
      const nextButton = within(container).getByRole('button', { name: /^next$/i })
      act(() => fireEvent.click(nextButton))
    }
    return correct
  }

  it('shows the actual correct count out of the actual played total for a normal 8-question session', () => {
    vi.useFakeTimers()
    const { container } = renderRowWordBuilder()
    const correct = playSessionTallyingCorrectness(container, 8)
    expect(container.textContent).toContain(`${correct} of 8 correct`)
    expect(container.textContent).not.toMatch(/問中/)
    expect(container.textContent).not.toMatch(/問正解/)
    expect(container.textContent).not.toMatch(/その調子/)
    expect(container.textContent).not.toMatch(/^Accuracy$/i)
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
      const isWrong = !!container.querySelector('input[type="checkbox"]')
      if (!isWrong) correct += 1
      const nextButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))
      if (nextButton) act(() => fireEvent.click(nextButton))
      guard += 1
    }

    expect(container.textContent).toMatch(/complete!/)
    expect(container.textContent).toMatch(new RegExp(`${correct} of \\d+ correct`))
    expect(container.textContent).not.toMatch(/ of 8 correct/)
  })
})

// a-row now has 5 words, not 4 (Issue #155 added えん/'yen' alongside ん).
const A_ROW_MEANING_TO_ROMAJI: Record<string, string> = { love: 'ai', house: 'ie', 'up / above': 'ue', blue: 'ao', yen: 'en' }

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

  const glyphOf = (id: string) => ({ a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お', n: 'ん' })[id]!

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

// Yōon + Special Katakana spelling-tile split — the character id stays ONE
// Review/SRS/recognition target everywhere else in the app, but Word
// Builder renders any 2-codepoint id whose codepoints merge into ONE mora
// (a small ゃゅょ/ャュョ/ぁぃぅぇぉ/ァィゥェォ attached to a base kana) as
// two display tiles. See displayGlyphsForCharId in wordBuilderTiles.ts.
describe('WordBuilderPage yōon + Special Katakana spelling-tile split', () => {
  const SPLIT_COMBOS: [string, [string, string]][] = [
    // Special Katakana
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
    // Yōon — now split just like Special Katakana (spec change from the
    // earlier "yōon stays whole" design)
    ['kya', ['き', 'ゃ']],
    ['shu', ['し', 'ゅ']],
    ['mya', ['み', 'ゃ']],
    ['katakana-kya', ['キ', 'ャ']],
    ['katakana-shu', ['シ', 'ュ']],
    ['katakana-cha', ['チ', 'ャ']],
    ['katakana-mya', ['ミ', 'ャ']],
  ]

  it.each(SPLIT_COMBOS)('%s splits into its two component glyphs', (charId, expected) => {
    expect(displayGlyphsForCharId(charId)).toEqual(expected)
  })

  it('a single-glyph character (ン, ー, ッ, ...) never splits', () => {
    expect(displayGlyphsForCharId('katakana-n')).toEqual(['ン'])
    expect(displayGlyphsForCharId('katakana-chouon')).toEqual(['ー'])
  })

  it('ファン (fan) tiles as [フ][ァ][ン]', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-fa-fan'].characterIds).map((t) => t.glyph)).toEqual([
      'フ',
      'ァ',
      'ン',
    ])
  })

  it('ティッシュ (tissue) tiles as [テ][ィ][ッ][シ][ュ]', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-fa-tisshu'].characterIds).map((t) => t.glyph)).toEqual([
      'テ',
      'ィ',
      'ッ',
      'シ',
      'ュ',
    ])
  })

  it('キャンディー (candy) tiles as [キ][ャ][ン][デ][ィ][ー]', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-fa-kyandii'].characterIds).map((t) => t.glyph)).toEqual([
      'キ',
      'ャ',
      'ン',
      'デ',
      'ィ',
      'ー',
    ])
  })

  it('ジェスチャー (gesture) tiles as [ジ][ェ][ス][チ][ャ][ー]', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['special-katakana-she-jesuchaa'].characterIds).map((t) => t.glyph)).toEqual([
      'ジ',
      'ェ',
      'ス',
      'チ',
      'ャ',
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

  it('ミャンマー (Myanmar) tiles as [ミ][ャ][ン][マ][ー]', () => {
    expect(buildFlatTargetTiles(WORDS_BY_ID['youon-katakana-ma-ra-myanmaa'].characterIds).map((t) => t.glyph)).toEqual([
      'ミ',
      'ャ',
      'ン',
      'マ',
      'ー',
    ])
  })

  it('distractor tiles use the exact same split rule as target tiles — a character never looks split in one role and whole in another', () => {
    // Same assertion as displayGlyphsForCharId's own per-id tests, but from
    // the angle that matters: WordBuilderPage's distractor path
    // (setupRound's distractorTiles) calls displayGlyphsForCharId directly,
    // so whatever it returns for a target charId is exactly what a
    // distractor drawing that same charId would render too — there is no
    // separate distractor-only code path left to drift.
    for (const [charId, expected] of SPLIT_COMBOS) {
      expect(displayGlyphsForCharId(charId)).toEqual(expected)
    }
  })

  it('a wrong placement on either split half of a yōon/Special Katakana tile records exactly one wrong result against the combined charId', () => {
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

  // Deterministic version of the invariant test above: missing only ONE
  // half of a split owner (e.g. only キ, not ャ, of きゃ) must record exactly
  // ONE wrong result — against the combined owner charId — never two
  // separate errors for キ and ャ, and never touch any other, correctly
  // placed, character in the same word. Works for whichever word the
  // session actually draws (queue order isn't controlled here) by reading
  // the real target back out of WORDS_BY_ROW/buildFlatTargetTiles instead
  // of hand-mapping every possible meaning.
  it('missing only one half of a split owner marks exactly that owner wrong, not its glyph-mate nor any other character in the word', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/special-katakana/special-katakana-fa-row/word-builder']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/word-builder" element={<WordBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const word = WORDS_BY_ROW['special-katakana-fa-row'].find((w) => w.meaning === meaning)!
    expect(word).toBeDefined()
    const flatTarget = buildFlatTargetTiles(word.characterIds)

    // Find a split owner (a charId contributing 2 display tiles) — every
    // Special Katakana word has at least one, since that's the whole point
    // of this row.
    const splitOwnerId = word.characterIds.find((id) => displayGlyphsForCharId(id).length === 2)!
    expect(splitOwnerId).toBeDefined()
    const splitIndex = flatTarget.findIndex((t) => t.charId === splitOwnerId)

    // Placed tiles become `disabled` (see KanaTile/handleTrayClick), so they
    // naturally drop out of this query on the next call — no need to track
    // which specific tile instance was already used.
    const trayButtons = () =>
      Array.from(container.querySelectorAll('button.font-kana:not(.border-dashed):not([disabled])')) as HTMLButtonElement[]
    const clickCorrect = (glyph: string) => {
      const chosen = trayButtons().find((b) => b.textContent === glyph)
      expect(chosen).toBeDefined()
      act(() => fireEvent.click(chosen!))
    }
    // Any target glyph is off-limits for the deliberate wrong pick — not
    // just this slot's own glyph — so it never cannibalizes a tile a LATER
    // slot still needs (e.g. a duplicate glyph like ー appearing twice in
    // the target). Only a genuine distractor tile is picked.
    const targetGlyphs = new Set(flatTarget.map((t) => t.glyph))
    const clickWrong = () => {
      const chosen = trayButtons().find((b) => !targetGlyphs.has(b.textContent ?? ''))
      expect(chosen).toBeDefined()
      act(() => fireEvent.click(chosen!))
    }

    // Fill every slot: the split owner's OWN index gets a deliberately wrong
    // (distractor) tile, everything else gets its real correct glyph.
    flatTarget.forEach((target, i) => {
      if (i === splitIndex) clickWrong()
      else clickCorrect(target.glyph)
    })

    const characters = useProgressStore.getState().characters
    expect(characters[splitOwnerId]).toMatchObject({ reviewActive: true, reviewStreak: 0 })
    for (const charId of word.characterIds) {
      if (charId === splitOwnerId) continue
      expect(characters[charId]?.reviewActive ?? false).toBe(false)
    }
  })
})
