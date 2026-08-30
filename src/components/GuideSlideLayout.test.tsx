import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConceptGuide } from './ConceptGuide'

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))
vi.mock('../hooks/useTTS', () => ({ useTTS: () => tts }))

// Mobile QA polish round: a prior fix added a blanket max-h-[48vh] to Guide
// slide images, which made them too small on real phones. The fix
// prioritizes width on mobile (w-full h-auto, no height cap) and only
// re-introduces a max-height constraint from the `sm:` breakpoint up. This
// test asserts the actual Tailwind classes rather than rendered pixel
// sizes (jsdom has no real layout engine), and that DOM order is still
// slide -> subtitle -> spacer/button, per the prior round's fix for the old
// slide/subtitle dead-space gap.
describe('Guide slide sizing (mobile-first)', () => {
  it('the slide image is mobile-first width-driven, not blanket-height-capped', () => {
    const { getByAltText } = render(
      <ConceptGuide
        testId="t"
        imageAsset="guide/x.webp"
        imageAlt="alt"
        lang="en"
        subtitle="Subtitle text"
        audioKey="k"
        dismissLabel="Next"
        onDismiss={() => {}}
      />,
    )
    const img = getByAltText('alt')
    expect(img.className).toMatch(/\bw-full\b/)
    expect(img.className).toMatch(/\bh-auto\b/)
    expect(img.className).not.toMatch(/max-h-\[48vh\]/)
    // A max-height constraint is still allowed, but only above mobile.
    expect(img.className).toMatch(/sm:max-h-\[\d+vh\]/)
  })

  it('keeps DOM order slide -> subtitle -> flexible spacer/button', () => {
    const { getByTestId, getByAltText, getByText } = render(
      <ConceptGuide
        testId="t"
        imageAsset="guide/x.webp"
        imageAlt="alt"
        lang="en"
        subtitle="Subtitle text"
        audioKey="k"
        dismissLabel="Next"
        onDismiss={() => {}}
      />,
    )
    const dialog = getByTestId('t')
    const img = getByAltText('alt')
    const subtitle = getByText('Subtitle text')
    const button = getByText('Next')
    // DOCUMENT_POSITION_FOLLOWING (4) means the second node comes after.
    expect(img.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(subtitle.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(dialog).toContainElement(button)
  })
})
