import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

function Dialog({ active }: { active: boolean }) {
  const containerRef = useFocusTrap<HTMLDivElement>(active)
  return (
    <div ref={containerRef} tabIndex={-1} data-testid="dialog">
      <button type="button">First</button>
      <button type="button">Second</button>
    </div>
  )
}

// Issue #46: full-screen Guide overlays trap Tab/Shift+Tab within the
// dialog and restore focus to whatever was focused before they opened.
describe('useFocusTrap', () => {
  it('focuses the first focusable element on activation', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    render(<Dialog active />)

    expect(document.activeElement?.textContent).toBe('First')
    outside.remove()
  })

  it('wraps Tab from the last item back to the first, and Shift+Tab from the first back to the last', () => {
    const { getByText } = render(<Dialog active />)
    const first = getByText('First')
    const second = getByText('Second')

    second.focus()
    fireEvent.keyDown(second, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(second)
  })

  it('restores focus to the previously-focused element on unmount', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    const { unmount } = render(<Dialog active />)
    expect(document.activeElement?.textContent).toBe('First')

    unmount()

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('does nothing while inactive', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    render(<Dialog active={false} />)

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
})
