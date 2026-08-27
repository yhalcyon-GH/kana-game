// "Ask Tamamizu" concept-help entry points (Hiragana/Katakana/Sokuon/Chōon/
// Yōon). The finished artwork already IS the full call-to-action UI — it has
// "Questions about X? Ask me!" baked into the image pixels — so this
// component adds no visible chrome of its own (no caption, no card
// background, no border): the whole image simply IS the button. Because the
// accessible name lives in pixels a screen reader can't read, the <img> is
// marked decorative (alt="" + aria-hidden) and the <button> itself carries
// the real name via aria-label.
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
      className="w-full max-w-md rounded-2xl bg-transparent transition hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
    >
      <img src={imageSrc} alt="" aria-hidden="true" className="block h-auto w-full" />
    </button>
  )
}
