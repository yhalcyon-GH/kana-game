import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UnbreakableKana } from './UnbreakableKana'

describe('UnbreakableKana', () => {
  it('renders the full kana string unchanged as combined text content', () => {
    const { container } = render(<UnbreakableKana kana="きゃく" />)
    expect(container.textContent).toBe('きゃく')
  })

  it('wraps each yōon glyph pair in one non-breaking span, never splitting the base kana from its small ゃ/ゅ/ょ', () => {
    const { container } = render(<UnbreakableKana kana="きゃく" />)
    const spans = Array.from(container.querySelectorAll('span'))
    expect(spans.map((s) => s.textContent)).toEqual(['きゃ', 'く'])
    for (const s of spans) expect(s).toHaveClass('whitespace-nowrap')
  })

  it.each([
    ['きゃ', ['きゃ']],
    ['きゅ', ['きゅ']],
    ['きょ', ['きょ']],
    ['しゃ', ['しゃ']],
    ['しゅ', ['しゅ']],
    ['しょ', ['しょ']],
    ['ちゃ', ['ちゃ']],
    ['ちゅ', ['ちゅ']],
    ['ちょ', ['ちょ']],
    ['にゃ', ['にゃ']],
    ['にゅ', ['にゅ']],
    ['にょ', ['にょ']],
    ['ひゃ', ['ひゃ']],
    ['ひゅ', ['ひゅ']],
    ['ひょ', ['ひょ']],
    ['みゃ', ['みゃ']],
    ['みゅ', ['みゅ']],
    ['みょ', ['みょ']],
    ['りゃ', ['りゃ']],
    ['りゅ', ['りゅ']],
    ['りょ', ['りょ']],
    ['キャ', ['キャ']],
    ['シャ', ['シャ']],
    ['ミョ', ['ミョ']],
  ])('keeps every isolated yōon combination %s together as one span', (kana, expected) => {
    const { container } = render(<UnbreakableKana kana={kana} />)
    const spans = Array.from(container.querySelectorAll('span'))
    expect(spans.map((s) => s.textContent)).toEqual(expected)
  })

  it('still splits plain (non-yōon) kana into separate morae, so ordinary wrapping between them is unaffected', () => {
    const { container } = render(<UnbreakableKana kana="あいう" />)
    const spans = Array.from(container.querySelectorAll('span'))
    expect(spans.map((s) => s.textContent)).toEqual(['あ', 'い', 'う'])
  })
})
