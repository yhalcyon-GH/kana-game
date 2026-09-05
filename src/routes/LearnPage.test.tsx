import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTERS_BY_ID } from '../data/characters'
import * as trackModule from '../lib/analytics/track'
import { useProgressStore } from '../store/progressStore'
import { useSavedItemsStore } from '../store/savedItemsStore'
import { LearnPage } from './LearnPage'
import { PracticeHubPage } from './PracticeHubPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

function renderLearn(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/learn/:categoryId/:rowId" element={<LearnPage />} />
        <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// "See them all" appears twice on the last character of the last batch —
// once as the primary action button (leads to that batch's own recap) and
// once as the always-present jump-ahead link (leads straight to the
// full-row recap) — see LearnPage.tsx. The primary button renders first in
// document order.
function clickPrimarySeeThemAll() {
  fireEvent.click(screen.getAllByText('See them all')[0])
}

// ka-row: 10 characters, 2 micro-batches of 5 (か行, が行) — see
// curriculum.ts's learnBatches.
describe('LearnPage micro-batches: a 10-character row (ka-row)', () => {
  it('progresses batch 1 chars -> batch 1 recap -> batch 2 chars -> batch 2 recap -> full-row recap -> words', () => {
    renderLearn('/learn/hiragana/ka-row')

    // Batch 1: か・き・く・け・こ, one at a time.
    expect(screen.getByText('Set 1 / 2 · 1 / 5')).toBeInTheDocument()
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set 1 / 2 · 5 / 5')).toBeInTheDocument()

    // Last character of batch 1 -> "See this set" -> batch 1 recap, showing
    // ONLY that batch's characters.
    fireEvent.click(screen.getByText('See this set'))
    expect(screen.getByText('か〜こ・が〜ご — Set 1 / 2')).toBeInTheDocument()
    expect(screen.queryByText('が')).not.toBeInTheDocument()

    // Batch 1 recap -> "Next set" -> batch 2, first character.
    fireEvent.click(screen.getByText('Next set'))
    expect(screen.getByText('Set 2 / 2 · 1 / 5')).toBeInTheDocument()
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set 2 / 2 · 5 / 5')).toBeInTheDocument()

    // Last character of the FINAL batch -> "See this set" -> that batch's
    // own recap first (still per Issue #9's spec), before the full recap.
    fireEvent.click(screen.getByText('See this set'))
    expect(screen.getByText('か〜こ・が〜ご — Set 2 / 2')).toBeInTheDocument()

    // Final batch recap -> "See them all" -> the full-row all-together recap.
    fireEvent.click(screen.getByText('See them all'))
    expect(screen.getByText(/all together/)).toBeInTheDocument()
    expect(screen.getByText('か')).toBeInTheDocument()
    expect(screen.getByText('が')).toBeInTheDocument()

    // Full recap -> words, exactly as the unbatched flow already does.
    fireEvent.click(screen.getByText('See the words'))
    expect(screen.getByText(/words you can already read/)).toBeInTheDocument()
  })

  it('does not mark the row taught until the final "Continue" step, regardless of batch navigation', () => {
    renderLearn('/learn/hiragana/ka-row')
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('Next set'))
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set')) // final batch recap
    fireEvent.click(screen.getByText('See them all')) // full recap
    fireEvent.click(screen.getByText('See the words'))

    expect(useProgressStore.getState().taughtRowIds).not.toContain('ka-row')
    fireEvent.click(screen.getByText('Continue'))
    expect(useProgressStore.getState().taughtRowIds).toContain('ka-row')
  })

  it('within a batch, Back steps one character at a time, and from the first character of the first batch, Back returns to the hub', () => {
    renderLearn('/learn/hiragana/ka-row')

    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set 1 / 2 · 2 / 5')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Set 1 / 2 · 1 / 5')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('か〜こ・が〜ご')).toBeInTheDocument() // Practice Hub heading
  })

  it("from the first character of a later batch, Back returns to the previous batch's recap; Back from a batch recap returns to that batch's last character", () => {
    renderLearn('/learn/hiragana/ka-row')
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set')) // batch 1 recap
    fireEvent.click(screen.getByText('Next set')) // batch 2, char 1
    expect(screen.getByText('Set 2 / 2 · 1 / 5')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('か〜こ・が〜ご — Set 1 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Set 1 / 2 · 5 / 5')).toBeInTheDocument()
  })

  it('the "See them all" jump-ahead link still works from any batch, targeting the full-row recap', () => {
    renderLearn('/learn/hiragana/ka-row')
    fireEvent.click(screen.getByText('See them all'))
    expect(screen.getByText(/all together/)).toBeInTheDocument()
  })

  it('the "See the words" jump-ahead link still works from any batch, targeting the word list', () => {
    renderLearn('/learn/hiragana/ka-row')
    fireEvent.click(screen.getByText('See the words'))
    expect(screen.getByText(/words you can already read/)).toBeInTheDocument()
  })
})

// Regression: Back from the full-row recap used to always assume it was
// reached via normal progression (final batch's own recap), landing on the
// LAST batch's recap regardless of where the jump-ahead links were actually
// clicked from. Back must instead undo the jump and return to the exact
// origin — see LearnPage.tsx's jumpOrigin.
describe('LearnPage micro-batches: Back correctly distinguishes a jump-ahead from normal progression', () => {
  it('mid-batch -> "See them all" -> Back returns to the exact original batch/character, not the final batch recap', () => {
    renderLearn('/learn/hiragana/ka-row')
    fireEvent.click(screen.getByText('Next')) // Set 1 / 2 · 1 / 5 -> 2 / 5
    expect(screen.getByText('Set 1 / 2 · 2 / 5')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See them all'))
    expect(screen.getByText(/all together/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Set 1 / 2 · 2 / 5')).toBeInTheDocument()
  })

  it('mid-batch -> "See the words" -> Back -> full recap -> Back returns to the exact original batch/character', () => {
    renderLearn('/learn/hiragana/ka-row')
    fireEvent.click(screen.getByText('Next')) // Set 1 / 2 · 1 / 5 -> 2 / 5
    expect(screen.getByText('Set 1 / 2 · 2 / 5')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See the words'))
    expect(screen.getByText(/words you can already read/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText(/all together/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Set 1 / 2 · 2 / 5')).toBeInTheDocument()
  })

  it('normal progression (final batch recap -> full recap) still returns to the final batch recap on Back, unaffected by the jump-ahead fix', () => {
    renderLearn('/learn/hiragana/ka-row')
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set')) // batch 1 recap
    fireEvent.click(screen.getByText('Next set')) // batch 2, char 1
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set')) // final (batch 2) recap
    expect(screen.getByText('か〜こ・が〜ご — Set 2 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See them all')) // -> full recap
    expect(screen.getByText(/all together/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('か〜こ・が〜ご — Set 2 / 2')).toBeInTheDocument()
  })
})

describe('LearnPage micro-batches: ha-row uses three 5-character batches', () => {
  it('shows Set 1/3, 2/3, 3/3 across は/ば/ぱ', () => {
    renderLearn('/learn/hiragana/ha-row')
    expect(screen.getByText('Set 1 / 3 · 1 / 5')).toBeInTheDocument()

    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('Next set'))
    expect(screen.getByText('Set 2 / 3 · 1 / 5')).toBeInTheDocument()

    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('Next set'))
    expect(screen.getByText('Set 3 / 3 · 1 / 5')).toBeInTheDocument()
  })
})

describe('LearnPage micro-batches: katakana-a-row uses 5/5/5/2 logical batches', () => {
  it('shows the ン・ー final batch as a 2-character set', () => {
    renderLearn('/learn/katakana/katakana-a-row')
    expect(screen.getByText('Set 1 / 4 · 1 / 5')).toBeInTheDocument()

    // Batch 1 (ア行, 5) -> recap -> next set.
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('Next set'))
    expect(screen.getByText('Set 2 / 4 · 1 / 5')).toBeInTheDocument()

    // Batch 2 (カ行, 5) -> recap -> next set.
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('Next set'))
    expect(screen.getByText('Set 3 / 4 · 1 / 5')).toBeInTheDocument()

    // Batch 3 (ガ行, 5) -> recap -> next set.
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('Next set'))
    expect(screen.getByText('Set 4 / 4 · 1 / 2')).toBeInTheDocument()
  })
})

describe('LearnPage micro-batches: yōon uses the specified 3-sound groupings', () => {
  it('youon-ka-row batches as きゃ・きゅ・きょ then ぎゃ・ぎゅ・ぎょ', () => {
    renderLearn('/learn/youon/youon-ka-row')
    expect(screen.getByText('Set 1 / 2 · 1 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set 1 / 2 · 3 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByText('See this set'))
    expect(screen.getByText('きゃ・きゅ・きょ・ぎゃ・ぎゅ・ぎょ — Set 1 / 2')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next set'))
    expect(screen.getByText('Set 2 / 2 · 1 / 3')).toBeInTheDocument()
  })
})

describe('LearnPage: rows with no learnBatches keep the old flow (no intermediate batch recap)', () => {
  // a-row now has 6 characters (あいうえおん, Issue #155) but still defines
  // no `learnBatches` — proves the old unbatched flow doesn't depend on
  // staying at 5-or-fewer characters, just on learnBatches being absent.
  it('a-row (6 characters, no learnBatches) goes straight from the last character to the full recap, with the plain position indicator', () => {
    renderLearn('/learn/hiragana/a-row')
    expect(screen.getByText('1 / 6')).toBeInTheDocument()
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('6 / 6')).toBeInTheDocument()
    // "See them all" appears twice here too — primary button + jump link —
    // both leading to the same destination for an unbatched row.
    expect(screen.getAllByText('See them all')).toHaveLength(2)
    expect(screen.queryByText('See this set')).not.toBeInTheDocument()
    clickPrimarySeeThemAll()
    expect(screen.getByText(/all together/)).toBeInTheDocument()
    expect(screen.queryByText(/— Set /)).not.toBeInTheDocument()
  })

  it('na-row (5 characters, no learnBatches) is unaffected', () => {
    renderLearn('/learn/hiragana/na-row')
    expect(screen.getByText('1 / 5')).toBeInTheDocument()
    expect(screen.queryByText(/Set \d/)).not.toBeInTheDocument()
  })
})

describe('LearnPage: character notes and audio behavior are unaffected by batching', () => {
  it('shows a character note on the first-encounter flashcard within a batch, same as before', () => {
    renderLearn('/learn/hiragana/ha-row')
    // は has a red usage note (particle-reading exception) — see characters.ts.
    expect(CHARACTERS_BY_ID.ha.note).toBeDefined()
    expect(screen.getByText(CHARACTERS_BY_ID.ha.note!)).toBeInTheDocument()
  })
})

describe('LearnPage: contrast-pairs and summary rows are unaffected', () => {
  it('sokuon-row (contrast-pairs) skips straight to the word step, no batching involved', () => {
    renderLearn('/learn/sokuon/sokuon-row')
    expect(screen.getByText(/listen and compare/)).toBeInTheDocument()
    expect(screen.queryByText(/new characters/)).not.toBeInTheDocument()
  })

  it('a summary row still shows the single "every character" grid, no batching involved', () => {
    renderLearn('/learn/hiragana/hiragana-summary')
    expect(screen.getByText(/every character/)).toBeInTheDocument()
    expect(screen.queryByText(/Set \d/)).not.toBeInTheDocument()
  })
})

// Issue #155: Summary's "every character" grid renders in CANONICAL gojūon
// order, not learning order — ん/ー are taught early (a-row/katakana-a-row)
// but still display LAST here, matching what a learner familiar with the
// gojūon table would expect. See curriculum.ts's getSummaryDisplayCharacterIds.
describe('LearnPage: Summary "every character" grid uses canonical display order (Issue #155)', () => {
  function kanaOrderInDom(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.font-kana')).map((el) => el.textContent ?? '')
  }

  it('hiragana-summary shows ん as the very last character card, after わ/を, not right after お', () => {
    const { container } = renderLearn('/learn/hiragana/hiragana-summary')
    const order = kanaOrderInDom(container)
    expect(order.at(-1)).toBe(CHARACTERS_BY_ID.n.kana)
    expect(order.at(-2)).toBe(CHARACTERS_BY_ID.wo.kana)
    expect(order.at(-3)).toBe(CHARACTERS_BY_ID.wa.kana)
    expect(order.slice(0, 5)).toEqual([
      CHARACTERS_BY_ID.a.kana,
      CHARACTERS_BY_ID.i.kana,
      CHARACTERS_BY_ID.u.kana,
      CHARACTERS_BY_ID.e.kana,
      CHARACTERS_BY_ID.o.kana,
    ])
  })

  it('katakana-summary ends in ワ・ヲ・ン・ー, not learning order', () => {
    const { container } = renderLearn('/learn/katakana/katakana-summary')
    const order = kanaOrderInDom(container)
    expect(order.slice(-4)).toEqual([
      CHARACTERS_BY_ID['katakana-wa'].kana,
      CHARACTERS_BY_ID['katakana-wo'].kana,
      CHARACTERS_BY_ID['katakana-n'].kana,
      CHARACTERS_BY_ID['katakana-chouon'].kana,
    ])
  })
})

// Issue #19: Learn is the character-introduction stage, so romaji stays
// always visible there — no per-question hiding/hint mechanic applies.
describe('LearnPage romaji (Issue #19)', () => {
  it('always shows romaji alongside the character being introduced', () => {
    renderLearn('/learn/hiragana/a-row')
    expect(screen.getByText(CHARACTERS_BY_ID.a.romaji)).toBeInTheDocument()
  })
})

// Item 8: the final word page (step B) gets a third "Back to hub" button
// alongside "Back"/"Continue" — it completes Learn the same way Continue
// does (markRowTaught) but returns to the hub instead of the next
// recommended activity.
describe('LearnPage: "Back to hub" on the final word page (Item 8)', () => {
  it('marks the row taught and navigates to the hub for a normal character-set row', () => {
    renderLearn('/learn/hiragana/a-row')
    fireEvent.click(screen.getByText('See them all'))
    fireEvent.click(screen.getByText('See the words'))
    expect(useProgressStore.getState().taughtRowIds).not.toContain('a-row')

    fireEvent.click(screen.getByText('Back to hub'))

    expect(useProgressStore.getState().taughtRowIds).toContain('a-row')
    // Navigated to the hub route, not a game route.
    expect(screen.queryByText('words you can already read', { exact: false })).toBeNull()
  })

  it("Continue's existing behavior (mark taught + go to the next recommended activity) is unaffected", () => {
    renderLearn('/learn/hiragana/a-row')
    fireEvent.click(screen.getByText('See them all'))
    fireEvent.click(screen.getByText('See the words'))

    fireEvent.click(screen.getByText('Continue'))

    expect(useProgressStore.getState().taughtRowIds).toContain('a-row')
  })

  it('works the same for a contrast-pairs row (sokuon), which enters step B directly', () => {
    renderLearn('/learn/sokuon/sokuon-row')
    expect(useProgressStore.getState().taughtRowIds).not.toContain('sokuon-row')

    fireEvent.click(screen.getByText('Back to hub'))

    expect(useProgressStore.getState().taughtRowIds).toContain('sokuon-row')
  })

  it('Similar Letters Learn has no "Back to hub" button and never calls markRowTaught — its own "Done" behavior is unchanged', () => {
    renderLearn('/learn/hiragana/hiragana-similar-letters')
    expect(screen.queryByText('Back to hub')).toBeNull()
    for (let i = 2; i <= 7; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Done'))
    expect(useProgressStore.getState().taughtRowIds).not.toContain('hiragana-similar-letters')
  })

  it('a summary row\'s final "Done" step has no "Back to hub" button (Summary regression-free)', () => {
    renderLearn('/learn/hiragana/hiragana-summary')
    fireEvent.click(screen.getByText('See the words'))
    expect(screen.queryByText('Back to hub')).toBeNull()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })
})

// Similar Letters (see GojuonRow.isSimilarLetters) — a dedicated Learn
// branch: 1 confusion group = 1 page, showing that group's kana cards
// side-by-side (not one-by-one like the normal flashcard flow above).
describe('LearnPage: Similar Letters', () => {
  it('hiragana has exactly 7 pages, one per confusion group, in the confirmed group order', () => {
    renderLearn('/learn/hiragana/hiragana-similar-letters')
    expect(screen.getByText('Group 1 / 7')).toBeInTheDocument()
    // Group 1 is あ・お.
    expect(screen.getByText(CHARACTERS_BY_ID.a.kana)).toBeInTheDocument()
    expect(screen.getByText(CHARACTERS_BY_ID.o.kana)).toBeInTheDocument()
    expect(screen.queryByText(CHARACTERS_BY_ID.ki.kana)).toBeNull()
  })

  it('katakana has exactly 8 pages', () => {
    renderLearn('/learn/katakana/katakana-similar-letters')
    expect(screen.getByText('Group 1 / 8')).toBeInTheDocument()
  })

  it('reuses the existing kana card (no separate image asset) — the same glyph markup as a normal row', () => {
    renderLearn('/learn/hiragana/hiragana-similar-letters')
    const glyph = screen.getByText(CHARACTERS_BY_ID.a.kana)
    expect(glyph.className).toMatch(/font-kana/)
    expect(document.querySelector('img')).toBeNull()
  })

  it('renders only the plain CharacterCard for each character in the group — no drawn-on annotation overlay', () => {
    renderLearn('/learn/hiragana/hiragana-similar-letters')
    // Group 1 is あ・お. No decorative SVG overlay of any kind should exist
    // anymore — Learn just shows the live CharacterCards side by side.
    expect(document.querySelector('svg')).toBeNull()
    expect(document.querySelector('marker')).toBeNull()
    expect(document.querySelector('circle')).toBeNull()
    expect(document.querySelector('line[x1]')).toBeNull()

    const glyphA = screen.getByText(CHARACTERS_BY_ID.a.kana)
    const glyphO = screen.getByText(CHARACTERS_BY_ID.o.kana)
    expect(glyphA.className).toMatch(/font-kana/)
    expect(glyphO.className).toMatch(/font-kana/)
    expect(document.querySelector('img')).toBeNull()
  })

  it('Next steps through every group in order, and the final group shows "Done"', () => {
    renderLearn('/learn/hiragana/hiragana-similar-letters')
    for (let i = 2; i <= 7; i++) {
      fireEvent.click(screen.getByText('Next'))
      expect(screen.getByText(`Group ${i} / 7`)).toBeInTheDocument()
    }
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('Back steps backward through groups, and Back on the first group returns to the Practice Hub', () => {
    renderLearn('/learn/hiragana/hiragana-similar-letters')
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Group 2 / 7')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Group 1 / 7')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    // Landed on the Practice Hub (its own title carries the 🔍 badge too —
    // see PracticeHubPage.tsx).
    expect(screen.getByText(/🔍/)).toBeInTheDocument()
  })

  it('finishing the last group returns to the Practice Hub WITHOUT marking the row taught', () => {
    renderLearn('/learn/hiragana/hiragana-similar-letters')
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Done'))

    expect(useProgressStore.getState().taughtRowIds).not.toContain('hiragana-similar-letters')
    expect(screen.getByText(/🔍/)).toBeInTheDocument()
  })
})

// Similar Letters explanation images (シ・ツ, ソ・ン) — see
// "fix: polish section labels and similar-letter support".
describe('LearnPage: Similar Letters explanation images', () => {
  it('shows the シ・ツ explanation image on the シ・ツ group (group 4), only there', () => {
    renderLearn('/learn/katakana/katakana-similar-letters')
    expect(screen.getByText('Group 1 / 8')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull() // group 1 (ア・マ) has no mapped image

    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Group 4 / 8')).toBeInTheDocument()
    expect(screen.getByText(CHARACTERS_BY_ID['katakana-shi'].kana)).toBeInTheDocument()
    expect(screen.getByText(CHARACTERS_BY_ID['katakana-tsu'].kana)).toBeInTheDocument()
    const img = document.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('similar-letters/shi-tsu.webp')
  })

  it('shows the ソ・ン explanation image on the ソ・リ・ン group (group 8), only there', () => {
    renderLearn('/learn/katakana/katakana-similar-letters')
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Group 8 / 8')).toBeInTheDocument()
    expect(screen.getByText(CHARACTERS_BY_ID['katakana-so'].kana)).toBeInTheDocument()
    expect(screen.getByText(CHARACTERS_BY_ID['katakana-n'].kana)).toBeInTheDocument()
    const img = document.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('similar-letters/so-n.webp')
  })

  it('does not show any explanation image on unrelated groups (e.g. ス・ヌ)', () => {
    renderLearn('/learn/katakana/katakana-similar-letters')
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Group 5 / 8')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('does not show a Similar Letters explanation image outside the Similar Letters lesson', () => {
    renderLearn('/learn/katakana/katakana-sa-row')
    expect(document.querySelector('img')).toBeNull()
  })
})

// Saved items (see savedItemsStore.ts) — Learn shows a Save checkbox
// alongside each individual Character/Word it renders, outside/beside the
// existing CharacterCard/WordCard (which stay the sole audio-playing
// button), never nested inside them.
describe('LearnPage: Save checkbox', () => {
  beforeEach(() => {
    useSavedItemsStore.setState({ savedCharacterIds: [], savedWordIds: [] })
  })

  it('shows an unchecked "Save" control for the character on step A, and saving it does not nest inside CharacterCard\'s own play button', () => {
    renderLearn('/learn/hiragana/a-row')
    const checkbox = screen.getByRole('checkbox', { name: /save あ/i })
    expect(checkbox).not.toBeChecked()
    // The checkbox must be a sibling of the play-audio button, never a
    // descendant of it (no interactive-in-interactive nesting).
    const playButton = screen.getByRole('button', { name: /play pronunciation/i })
    expect(playButton.contains(checkbox)).toBe(false)

    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(useSavedItemsStore.getState().isCharacterSaved('a')).toBe(true)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('unsaving via the Learn checkbox removes it from savedItemsStore', () => {
    renderLearn('/learn/hiragana/a-row')
    const checkbox = screen.getByRole('checkbox', { name: /save あ/i })
    fireEvent.click(checkbox)
    expect(useSavedItemsStore.getState().isCharacterSaved('a')).toBe(true)
    fireEvent.click(checkbox)
    expect(useSavedItemsStore.getState().isCharacterSaved('a')).toBe(false)
  })

  it('reflects an already-saved character as checked on load', () => {
    useSavedItemsStore.getState().toggleCharacter('a')
    renderLearn('/learn/hiragana/a-row')
    expect(screen.getByRole('checkbox', { name: /saved あ/i })).toBeChecked()
  })

  it('shows a Save checkbox for each word on the "words you can already read" step, and saving one works', () => {
    renderLearn('/learn/hiragana/a-row')
    fireEvent.click(screen.getByText('See the words'))

    const wordCheckboxes = screen.getAllByRole('checkbox', { name: /^save /i })
    expect(wordCheckboxes.length).toBeGreaterThan(0)
    fireEvent.click(wordCheckboxes[0])
    expect(wordCheckboxes[0]).toBeChecked()
    expect(
      useSavedItemsStore.getState().savedWordIds.length === 1 && useSavedItemsStore.getState().savedWordIds[0],
    ).toBeTruthy()
  })

  it('shows Save checkboxes for each character in a Similar Letters group', () => {
    renderLearn('/learn/hiragana/hiragana-similar-letters')
    // Group 1 is あ・お.
    const checkboxes = screen.getAllByRole('checkbox', { name: /^save /i })
    expect(checkboxes.length).toBe(2)
    fireEvent.click(checkboxes[0])
    expect(useSavedItemsStore.getState().savedCharacterIds).toEqual(['a'])
  })
})

// Special Katakana (see curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID) —
// reuses the existing character-set Learn flow (batches -> recap -> words),
// no dedicated implementation. Session 1 (ファ〜ディ): 6 characters, 4+2
// batches, 13 words. Session 2 (シェ〜ウォ): 6 characters, 3+3 batches, 9
// words.
describe('LearnPage: Special Katakana Session 1 (special-katakana-fa-row, 4+2 batches)', () => {
  it('progresses batch 1 (4 chars) -> batch 1 recap -> batch 2 (2 chars) -> batch 2 recap -> full recap -> 13 words', () => {
    renderLearn('/learn/special-katakana/special-katakana-fa-row')

    expect(screen.getByText('Set 1 / 2 · 1 / 4')).toBeInTheDocument()
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set 1 / 2 · 4 / 4')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See this set'))
    expect(screen.queryByText('ティ')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Next set'))
    expect(screen.getByText('Set 2 / 2 · 1 / 2')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set 2 / 2 · 2 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('See them all'))
    expect(screen.getByText(/all together/)).toBeInTheDocument()
    expect(screen.getByText('ファ')).toBeInTheDocument()
    expect(screen.getByText('ディ')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See the words'))
    expect(screen.getByText(/words you can already read/)).toBeInTheDocument()
    // 13 confirmed words for this session — spot-check a few, from each
    // sub-group (ファ/フィ/フェ/フォ/ティ/ディ).
    // Rendered via UnbreakableKana (one non-breaking span per mora — see
    // "fix: polish section labels and similar-letter support"), so each
    // word's kana is split across sibling elements; assert on the page's
    // combined text content instead of a single getByText match.
    expect(document.body.textContent).toContain('ファン')
    expect(document.body.textContent).toContain('フィルム')
    expect(document.body.textContent).toContain('カフェ')
    expect(document.body.textContent).toContain('フォーク')
    expect(document.body.textContent).toContain('ティッシュ')
    expect(document.body.textContent).toContain('ディナー')
  })
})

describe('LearnPage: Special Katakana Session 2 (special-katakana-she-row, 3+3 batches)', () => {
  it('progresses batch 1 (3 chars) -> batch 1 recap -> batch 2 (3 chars) -> batch 2 recap -> full recap -> 9 words', () => {
    renderLearn('/learn/special-katakana/special-katakana-she-row')

    expect(screen.getByText('Set 1 / 2 · 1 / 3')).toBeInTheDocument()
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set 1 / 2 · 3 / 3')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('Next set'))
    expect(screen.getByText('Set 2 / 2 · 1 / 3')).toBeInTheDocument()
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set 2 / 2 · 3 / 3')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('See them all'))
    expect(screen.getByText('シェ')).toBeInTheDocument()
    expect(screen.getByText('ウォ')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See the words'))
    expect(document.body.textContent).toContain('シェフ')
    expect(document.body.textContent).toContain('ハロウィン')
    expect(document.body.textContent).toContain('ウォーキング')
  })

  it('completing Learn (Continue) marks the row taught, same as any other row', () => {
    renderLearn('/learn/special-katakana/special-katakana-she-row')
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('Next set'))
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See this set'))
    fireEvent.click(screen.getByText('See them all'))
    fireEvent.click(screen.getByText('See the words'))
    fireEvent.click(screen.getByText('Continue'))
    expect(useProgressStore.getState().taughtRowIds).toContain('special-katakana-she-row')
  })
})

describe('LearnPage analytics', () => {
  it('fires lesson_started exactly once per row, even under React StrictMode double-invoke', () => {
    const trackSpy = vi.spyOn(trackModule, 'track')
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/learn/hiragana/a-row']}>
          <Routes>
            <Route path="/learn/:categoryId/:rowId" element={<LearnPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )
    const startedCalls = trackSpy.mock.calls.filter((c) => c[0] === 'lesson_started')
    expect(startedCalls).toHaveLength(1)
    expect(startedCalls[0][1]).toEqual({ category: 'hiragana', row: 'a-row' })
    trackSpy.mockRestore()
  })

  it('fires lesson_completed when Continue is clicked', () => {
    const trackSpy = vi.spyOn(trackModule, 'track')
    renderLearn('/learn/hiragana/a-row')
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('See them all'))
    fireEvent.click(screen.getByText('See the words'))
    fireEvent.click(screen.getByText('Continue'))
    expect(trackSpy).toHaveBeenCalledWith('lesson_completed', { category: 'hiragana', row: 'a-row' })
    trackSpy.mockRestore()
  })
})
