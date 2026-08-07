type Props = {
  kana: string
  onClick?: () => void
  disabled?: boolean
  selected?: boolean
}

// Tappable kana tile shared by the word-builder tray/slots and the
// listening-game answer choices.
export function KanaTile({ kana, onClick, disabled, selected }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-14 w-14 rounded-xl border-2 text-2xl font-bold transition ${
        selected
          ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950'
          : 'border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800'
      } ${disabled ? 'opacity-40' : 'hover:border-blue-400'}`}
    >
      {kana}
    </button>
  )
}
