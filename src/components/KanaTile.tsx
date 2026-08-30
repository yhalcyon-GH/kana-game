type Props = {
  kana: string
  onClick?: () => void
  disabled?: boolean
}

// Tappable kana tile used by the word-builder tray. `kana` is one learning
// unit (character id), not necessarily one glyph — a yōon/Special Katakana
// tile (e.g. きゃ, ファ) shows both glyphs together, so a smaller size keeps
// it inside the same fixed h-14 w-14 footprint as a normal 1-glyph tile.
export function KanaTile({ kana, onClick, disabled }: Props) {
  const sizeClass = [...kana].length > 1 ? 'text-base' : 'text-2xl'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`font-kana h-14 w-14 whitespace-nowrap rounded-xl border-2 border-neutral-300 bg-white font-bold transition dark:border-neutral-600 dark:bg-neutral-800 ${sizeClass} ${
        disabled ? 'opacity-40' : 'hover:border-blue-400'
      }`}
    >
      {kana}
    </button>
  )
}
