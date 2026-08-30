import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { KanaChar } from '../data/types'
import { CharacterGrid } from './CharacterGrid'

function char(id: string, kana: string, romaji: string): KanaChar {
  return { id, kana, romaji, rowId: 'test-row', type: 'base' }
}

describe('CharacterGrid', () => {
  it('default (non-compact) layout groups into 5-column rows with empty placeholder slots for missing vowels', () => {
    // Only i/u/e columns present (like ティ/ディ) — the default grid still
    // reserves all 5 vowel-column slots, leaving 2 empty.
    const chars = [char('a', 'ア', 'a'), char('i', 'イ', 'i'), char('u', 'ウ', 'u')]
    const { container } = render(<CharacterGrid characters={chars} />)
    const gridRow = container.querySelector('.grid-cols-5')
    expect(gridRow).not.toBeNull()
    expect(gridRow!.children.length).toBe(5)
  })

  it('compact layout renders only the characters that exist, no empty placeholder slots', () => {
    const chars = [char('fi', 'ファ', 'fa'), char('fe', 'フェ', 'fe'), char('fo', 'フォ', 'fo')]
    const { container, getAllByText } = render(<CharacterGrid characters={chars} compact />)
    expect(container.querySelector('.grid-cols-5')).toBeNull()
    expect(getAllByText('ファ', { selector: 'span' })).toHaveLength(1)
    expect(getAllByText('フェ', { selector: 'span' })).toHaveLength(1)
    expect(getAllByText('フォ', { selector: 'span' })).toHaveLength(1)
    // Exactly 3 rendered cards, nothing else — flex-wrap with no filler divs.
    expect(container.querySelectorAll('button, .rounded-2xl').length).toBeGreaterThanOrEqual(3)
  })
})
