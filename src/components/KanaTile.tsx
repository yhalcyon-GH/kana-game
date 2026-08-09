type Props = {
  kana: string
  onClick?: () => void
  disabled?: boolean
}

// Tappable kana tile used by the word-builder tray.
export function KanaTile({ kana, onClick, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`font-kana h-14 w-14 rounded-xl border-2 border-neutral-300 bg-white text-2xl font-bold transition dark:border-neutral-600 dark:bg-neutral-800 ${
        disabled ? 'opacity-40' : 'hover:border-blue-400'
      }`}
    >
      {kana}
    </button>
  )
}
