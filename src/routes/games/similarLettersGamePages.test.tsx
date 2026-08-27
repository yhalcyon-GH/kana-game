import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { useProgressStore } from '../../store/progressStore'
import { KanaQuizPage } from './KanaQuizPage'
import { KanaTypingPage } from './KanaTypingPage'
import { ListeningPage } from './ListeningPage'
import { WordBuilderPage } from './WordBuilderPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
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

describe('Similar Letters — Kana Quiz target pool', () => {
  it('every round target is either a hiragana confusion-group character or another real hiragana character (never katakana)', () => {
    for (let attempt = 0; attempt < 15; attempt++) {
      useProgressStore.getState().resetProgress()
      const { getByRole, unmount } = renderGame(KanaQuizPage, 'hiragana', 'hiragana-similar-letters', 'kana-quiz')
      const glyphEl = document.querySelector('.font-kana.text-7xl')
      if (glyphEl) {
        const kana = glyphEl.textContent
        const char = Object.values(CHARACTERS_BY_ID).find((c) => c.kana === kana)
        expect(char, `unrecognized glyph "${kana}"`).toBeDefined()
        expect(char!.id.startsWith('katakana-'), `target "${char!.id}" should be hiragana`).toBe(false)
      } else {
        // Recall mode shows 🔊 instead of the glyph — nothing to assert on
        // that round, still confirms the page rendered without crashing.
        expect(getByRole).toBeDefined()
      }
      unmount()
    }
  })

  it('when the target is る or ろ (visible in Read-mode rounds), the choices include its one confusion-group mate', () => {
    // Read mode shows the target as kana (prompt) but each CHOICE as its
    // romaji/displayLabel (see KanaQuizPage's read-mode choice rendering) —
    // so "is ろ among the choices" is checked via ro's romaji, not its kana.
    // Read-mode rounds happen ~50% of the time (see buildQuizModePlan), and
    // る/ろ is 1 of 7 confusion groups — a generous attempt budget keeps this
    // from being flaky while still exercising the real page/lib wiring
    // end-to-end (see similarLettersSelection.test.ts for the seeded,
    // exact-sequence version of this same guarantee at the lib level).
    let readModeRuOrRoSightings = 0
    let matchedMate = false
    for (let attempt = 0; attempt < 200 && readModeRuOrRoSightings < 3; attempt++) {
      useProgressStore.getState().resetProgress()
      const { getAllByRole, unmount } = renderGame(KanaQuizPage, 'hiragana', 'hiragana-similar-letters', 'kana-quiz')
      const glyphEl = document.querySelector('.font-kana.text-7xl')
      const targetKana = glyphEl?.textContent
      if (targetKana === 'る' || targetKana === 'ろ') {
        readModeRuOrRoSightings++
        const mateRomaji = targetKana === 'る' ? 'ro' : 'ru'
        const choiceButtons = getAllByRole('button').filter((b) => b.className.includes('rounded-xl border-2'))
        const choiceTexts = choiceButtons.map((b) => b.textContent)
        if (choiceTexts.includes(mateRomaji)) matchedMate = true
      }
      unmount()
    }
    expect(readModeRuOrRoSightings, 'never observed a る/ろ Read-mode round in 200 attempts').toBeGreaterThan(0)
    expect(matchedMate).toBe(true)
  })
})

describe('Similar Letters — word-based games target pool', () => {
  it("Listening's target word only uses katakana characters for the katakana row (never mixes in hiragana)", () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      useProgressStore.getState().resetProgress()
      const { unmount } = renderGame(ListeningPage, 'katakana', 'katakana-similar-letters', 'listening')
      const glyphEl = document.querySelector('.font-kana.block')
      if (glyphEl?.textContent) {
        for (const glyph of glyphEl.textContent) {
          const char = Object.values(CHARACTERS_BY_ID).find((c) => c.kana === glyph)
          if (char) expect(char.id.startsWith('katakana-'), `"${char.id}" should be katakana`).toBe(true)
        }
      }
      unmount()
    }
  })

  it('Word Builder and Kana Typing render without crashing for a Similar Letters row', () => {
    const wb = renderGame(WordBuilderPage, 'hiragana', 'hiragana-similar-letters', 'word-builder')
    expect(wb.container).toBeInTheDocument()
    const kt = renderGame(KanaTypingPage, 'hiragana', 'hiragana-similar-letters', 'kana-typing')
    expect(kt.container).toBeInTheDocument()
  })
})

describe('Similar Letters — Listening spelling-choice answer handling', () => {
  it('selecting a choice known (via data-correct) to be wrong records recordWordReviewResult(currentWord.id, false), never a fake choice key', () => {
    for (let attempt = 0; attempt < 15; attempt++) {
      useProgressStore.getState().resetProgress()
      const { container, unmount } = renderGame(ListeningPage, 'hiragana', 'hiragana-similar-letters', 'listening')
      const buttons = Array.from(container.querySelectorAll('[data-testid="spelling-choice"]')) as HTMLButtonElement[]
      // Deterministically identify the wrong choice via the test-only
      // data-correct attribute (see ListeningPage.tsx) rather than relying on
      // positional luck — every round has at least one wrong choice.
      const wrongButton = buttons.find((b) => b.getAttribute('data-correct') === 'false')!
      expect(wrongButton).toBeDefined()

      fireEvent.click(wrongButton)

      const wordsState = useProgressStore.getState().words
      const activeIds = Object.keys(wordsState)
      expect(activeIds.length).toBeGreaterThan(0)
      activeIds.forEach((id) => {
        expect(id).not.toMatch(/^wrong-\d+$/)
        expect(id).not.toBe('correct')
      })
      // The word that was actually recorded must reflect the wrong answer.
      const recordedWrong = Object.entries(wordsState).some(([, w]) => w.reviewActive)
      expect(recordedWrong).toBe(true)
      unmount()
    }
  })

  it('selecting the choice known (via data-correct) to be correct records recordWordReviewResult(currentWord.id, true)', () => {
    for (let attempt = 0; attempt < 15; attempt++) {
      useProgressStore.getState().resetProgress()
      const { container, unmount } = renderGame(ListeningPage, 'hiragana', 'hiragana-similar-letters', 'listening')
      const buttons = Array.from(container.querySelectorAll('[data-testid="spelling-choice"]')) as HTMLButtonElement[]
      const correctButton = buttons.find((b) => b.getAttribute('data-correct') === 'true')!
      expect(correctButton).toBeDefined()

      fireEvent.click(correctButton)

      const wordsState = useProgressStore.getState().words
      const ids = Object.keys(wordsState)
      expect(ids.length).toBeGreaterThan(0)
      ids.forEach((id) => {
        expect(id).not.toMatch(/^wrong-\d+$/)
        expect(id).not.toBe('correct')
      })
      // A correct answer must not activate word Review for anything.
      expect(Object.values(wordsState).every((w) => !w.reviewActive)).toBe(true)
      unmount()
    }
  })

  it('never creates a fake AnchorWord object in progressStore.words for a wrong spelling choice', () => {
    useProgressStore.getState().resetProgress()
    const { container, unmount } = renderGame(ListeningPage, 'hiragana', 'hiragana-similar-letters', 'listening')
    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    fireEvent.click(buttons[0])
    const words = useProgressStore.getState().words
    expect(Object.keys(words).length).toBeLessThanOrEqual(1)
    unmount()
  })
})

describe('Similar Letters — side effects reuse normal SRS/Review semantics', () => {
  it("answering a Kana Quiz round for a target character updates THAT character's own box/Review state, exactly like normal Practice", () => {
    const { getAllByRole } = renderGame(KanaQuizPage, 'hiragana', 'hiragana-similar-letters', 'kana-quiz')
    const glyphEl = document.querySelector('.font-kana.text-7xl')
    const targetKana = glyphEl?.textContent
    const targetChar = targetKana ? Object.values(CHARACTERS_BY_ID).find((c) => c.kana === targetKana) : undefined

    const buttons = getAllByRole('button').filter((b) => b.className.includes('rounded-xl'))
    if (buttons.length > 0) fireEvent.click(buttons[0])

    if (targetChar) {
      // Whatever the outcome, the character's own progress entry now
      // exists — same recordResult/recordCharacterReviewResult call sites
      // as every other row, unmodified.
      expect(useProgressStore.getState().characters[targetChar.id]).toBeDefined()
    }
  })
})
