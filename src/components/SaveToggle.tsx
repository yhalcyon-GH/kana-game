type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  // Accessible name for the checkbox — always includes the item's own kana/
  // label so a screen reader announces WHAT is being saved/unsaved, not
  // just "Save"/"Saved" in isolation.
  ariaLabel: string
}

// Presentational checkbox control — visible text is always exactly "Save"
// (unchecked) or "Saved" (checked), per spec; never a star, never any other
// wording. A native <label>+<input type="checkbox"> pair: clicking the text
// toggles the box, it's keyboard-operable and announces checked state for
// free, and — critically — this is rendered OUTSIDE CharacterCard/WordCard
// (siblings, not nested), so it never creates a button-inside-button (or
// checkbox-inside-button) DOM structure with those cards' own play-audio
// button.
export function SaveToggle({ checked, onChange, ariaLabel }: Props) {
  return (
    <label className="flex min-h-[2.25rem] items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        className="h-5 w-5"
      />
      {checked ? 'Saved' : 'Save'}
    </label>
  )
}
