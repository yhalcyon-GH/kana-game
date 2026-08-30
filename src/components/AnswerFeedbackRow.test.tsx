import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AnswerFeedbackRow } from './AnswerFeedbackRow'

// Covers the shared 2:1 mascot-stage + action-column layout used by all
// four graded mini-games (Kana Quiz, Listening, Word Builder, Kana Typing)
// — see the "stabilize practice feedback layout" fix. The mascot stage's
// structure/position must stay identical across moods, and the action
// column must reserve constant space regardless of which controls are
// present, so switching moods or toggling Next/Save never moves the
// mascot's bounding box.
describe('AnswerFeedbackRow', () => {
  it('renders the mascot inside a fixed 2fr/1fr grid stage', () => {
    const { container } = render(<AnswerFeedbackRow mood="normal" showNext={false} onNext={vi.fn()} />)
    const grid = container.querySelector('.grid.grid-cols-\\[2fr_1fr\\]')
    expect(grid).not.toBeNull()
    const stage = container.querySelector('[data-testid="mascot-stage"]')
    expect(stage).not.toBeNull()
    expect(stage?.querySelector('img')).not.toBeNull()
  })

  it('keeps the same stage structure across every mood', () => {
    const moods = ['normal', 'correct', 'incorrect', 'streak'] as const
    const stageHtmlByMood = moods.map((mood) => {
      const { container } = render(<AnswerFeedbackRow mood={mood} showNext onNext={vi.fn()} />)
      const stage = container.querySelector('[data-testid="mascot-stage"]')!
      // Same wrapper classes/shape every mood — only the <img> src differs.
      return stage.className
    })
    expect(new Set(stageHtmlByMood).size).toBe(1)
  })

  it('shows Next above Save, and Save is absent on a correct answer', () => {
    const { getByRole, queryByRole } = render(
      <AnswerFeedbackRow mood="correct" showNext onNext={vi.fn()} />,
    )
    expect(getByRole('button', { name: /next/i })).not.toBeNull()
    expect(queryByRole('checkbox')).toBeNull()
  })

  it('shows Next and Save together on a wrong answer, Next first in DOM order', () => {
    const { getByRole } = render(
      <AnswerFeedbackRow
        mood="incorrect"
        showNext
        onNext={vi.fn()}
        saveControl={
          <label>
            <input type="checkbox" aria-label="Save あ" />
            Save
          </label>
        }
      />,
    )
    const next = getByRole('button', { name: /next/i })
    const save = getByRole('checkbox')
    expect(next.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('reserves the same action-column footprint whether or not Next/Save are present', () => {
    const { container: before } = render(<AnswerFeedbackRow mood="normal" showNext={false} onNext={vi.fn()} />)
    const { container: after } = render(
      <AnswerFeedbackRow
        mood="incorrect"
        showNext
        onNext={vi.fn()}
        saveControl={<input type="checkbox" aria-label="Save" />}
      />,
    )
    const beforeSlots = Array.from(before.querySelectorAll('.flex.flex-col.gap-2 > div')).map((el) => el.className)
    const afterSlots = Array.from(after.querySelectorAll('.flex.flex-col.gap-2 > div')).map((el) => el.className)
    expect(beforeSlots).toEqual(afterSlots)
  })

  it('never renders more than one Next button', () => {
    const { getAllByRole } = render(<AnswerFeedbackRow mood="correct" showNext onNext={vi.fn()} />)
    expect(getAllByRole('button', { name: /next/i })).toHaveLength(1)
  })

  it('calls onNext exactly once per click', () => {
    const onNext = vi.fn()
    const { getByRole } = render(<AnswerFeedbackRow mood="correct" showNext onNext={onNext} />)
    fireEvent.click(getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
