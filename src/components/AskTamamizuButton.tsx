// "Ask Tamamizu" concept-help entry points (Hiragana/Katakana/Sokuon/Chōon/
// Yōon). The artwork carries the scene (Tamamizu + speech bubble) but
// doesn't read as clickable on its own — a mobile QA pass added a visible
// "Ask" call-to-action pill so it's obvious this whole image IS a button.
// The click target is still the ENTIRE <button> (image included), unchanged
// from before; the "Ask" label is a purely decorative overlay, not a nested
// interactive element. Because the artwork's own baked-in text ("Questions
// about X? Ask me!") lives in pixels a screen reader can't read, the <img>
// stays marked decorative (alt="" + aria-hidden) and the <button> itself
// still carries the one real accessible name via aria-label; the new <span>
// is also aria-hidden so it never causes a second announcement.
type Props = {
  imageSrc: string
  ariaLabel: string
  onClick: () => void
  testId?: string
}

export function AskTamamizuButton({ imageSrc, ariaLabel, onClick, testId }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      className="relative block w-full max-w-md rounded-2xl bg-transparent transition hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
    >
      <img src={imageSrc} alt="" aria-hidden="true" className="block h-auto w-full" />
      {/* Positioned with percentages relative to the button (not fixed
          pixels), so it works uniformly across all 5 artworks' differing
          aspect ratios without per-image tuning — below the speech bubble,
          toward Tamamizu's right, reading as a primary CTA near the bubble
          without ever overflowing a narrow mobile width. */}
      <span
        aria-hidden="true"
        className="absolute top-[52%] right-[8%] rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-md sm:text-base"
      >
        Ask
      </span>
    </button>
  )
}
