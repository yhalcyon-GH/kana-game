type Props = {
  romaji: string
  // Settings' "Always show romaji hints" — when on, the hint is revealed
  // from the start and the "Show romaji" control isn't rendered at all
  // (it would be redundant).
  alwaysShow: boolean
  revealed: boolean
  onReveal: () => void
}

// Practice-only per-question romaji hint (Listening/Word Builder) — hidden
// by default, revealed on request for the CURRENT question only. Callers
// reset `revealed` back to false when the question changes; see
// progressStore.ts's alwaysShowRomajiHints for the always-on setting.
export function RomajiHint({ romaji, alwaysShow, revealed, onReveal }: Props) {
  if (alwaysShow || revealed) {
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">{romaji}</span>
  }
  return (
    <button
      type="button"
      onClick={onReveal}
      className="text-xs text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
    >
      Show romaji
    </button>
  )
}
