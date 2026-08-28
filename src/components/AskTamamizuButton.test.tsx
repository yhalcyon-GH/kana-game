import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AskTamamizuButton } from './AskTamamizuButton'

// Mobile QA polish round: the artwork alone didn't read as clickable, so a
// visible "Ask" CTA pill was added inside the SAME <button> — this must
// remain exactly one interactive element, with the new label purely
// decorative (never a second accessible name / announcement) and clicking
// anywhere in the button (image area or label area) must fire the one
// handler.
describe('AskTamamizuButton visible "Ask" CTA', () => {
  it('renders exactly one interactive element (the outer button)', () => {
    const { container } = render(
      <AskTamamizuButton imageSrc="/x.webp" ariaLabel="Ask Tamamizu about X" onClick={() => {}} />,
    )
    const interactive = container.querySelectorAll('button, a, [role="button"], [role="link"]')
    expect(interactive).toHaveLength(1)
    expect(interactive[0].tagName).toBe('BUTTON')
  })

  it('shows visible "Ask" text', () => {
    const { getByText } = render(<AskTamamizuButton imageSrc="/x.webp" ariaLabel="Ask Tamamizu about X" onClick={() => {}} />)
    expect(getByText('Ask')).toBeInTheDocument()
  })

  it('marks the "Ask" label aria-hidden so it never double-announces alongside the button aria-label', () => {
    const { getByText } = render(<AskTamamizuButton imageSrc="/x.webp" ariaLabel="Ask Tamamizu about X" onClick={() => {}} />)
    expect(getByText('Ask')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps the decorative <img> alt="" and aria-hidden, and the button aria-label as the one accessible name', () => {
    const { getByRole } = render(<AskTamamizuButton imageSrc="/x.webp" ariaLabel="Ask Tamamizu about X" onClick={() => {}} />)
    const button = getByRole('button', { name: 'Ask Tamamizu about X' })
    const img = button.querySelector('img')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('aria-hidden', 'true')
  })

  it('clicking the image area triggers the same handler as clicking the button generally', () => {
    const onClick = vi.fn()
    const { getByRole } = render(<AskTamamizuButton imageSrc="/x.webp" ariaLabel="Ask Tamamizu about X" onClick={onClick} />)
    const button = getByRole('button', { name: 'Ask Tamamizu about X' })
    fireEvent.click(button.querySelector('img')!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('clicking the "Ask" label area triggers the same handler', () => {
    const onClick = vi.fn()
    const { getByText } = render(<AskTamamizuButton imageSrc="/x.webp" ariaLabel="Ask Tamamizu about X" onClick={onClick} />)
    fireEvent.click(getByText('Ask'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  // Manual-review follow-up: the "Ask" pill was too high (top-anchored); it
  // was moved so its bottom edge sits roughly flush with the artwork's
  // bottom edge, which is naturally a bottom-anchored position rather than a
  // top-percentage. Precise visual alignment can't be asserted from class
  // strings, but the anchor direction is a meaningful, non-brittle check.
  it('is positioned with a bottom anchor (not a top anchor) so its bottom edge tracks the artwork bottom', () => {
    const { getByText } = render(<AskTamamizuButton imageSrc="/x.webp" ariaLabel="Ask Tamamizu about X" onClick={() => {}} />)
    const label = getByText('Ask')
    expect(label.className).toMatch(/bottom-\[/)
    expect(label.className).not.toMatch(/top-\[/)
  })
})
